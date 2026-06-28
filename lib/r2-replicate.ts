import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { r2Cache } from "@/lib/db/schema";
import { statPath } from "@/lib/fs/storage";
import { r2Enabled, r2Bucket, r2KeyFor } from "@/lib/r2";

// R2 "가장 빠른 다운로드 경로" — 적재/축출(쓰기 쪽). 읽기(presign)·조회는 lib/r2.ts.
// 외부 공유된 최신 영상만 R2 에 두고, 예산(≤~9.5GB, 10GB 무료티어 여유) + TTL(3일)로 굴린다.
// 정본은 항상 M2 라 모든 동작이 실패해도 throw 안 하고 M2 서빙으로 자연 폴백.
// 업로드/삭제는 rclone(M2 에 설치·설정됨, 멀티파트 ~77MB/s 검증)로 위임 — >5GB 도 안전.

const execFileP = promisify(execFile);
const RCLONE = process.env.RCLONE_BIN ?? "/opt/homebrew/bin/rclone";
const RCLONE_CONF = process.env.RCLONE_CONFIG ?? ""; // 비면 rclone 기본 위치(~/.config/rclone)
const REMOTE = process.env.R2_RCLONE_REMOTE ?? "r2"; // rclone.conf 의 remote 이름
const BUDGET = Number(process.env.R2_BUDGET_BYTES ?? 9_500_000_000); // ~9.5GB
const TTL_MS = Number(process.env.R2_TTL_DAYS ?? 3) * 86_400_000; // 3일
const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi|m2ts|mts)$/i;

export function isVideoPath(p: string): boolean {
  return VIDEO_RE.test(p);
}

function rcloneBase(): string[] {
  return RCLONE_CONF ? ["--config", RCLONE_CONF] : [];
}
function remotePath(key: string): string {
  return `${REMOTE}:${r2Bucket()}/${key}`;
}

async function totalBytes(): Promise<number> {
  const r = await db
    .select({ s: sql<string>`coalesce(sum(${r2Cache.bytes}), 0)` })
    .from(r2Cache);
  return Number(r[0]?.s ?? 0);
}

async function r2DeleteKey(key: string): Promise<void> {
  try {
    await execFileP(
      RCLONE,
      [...rcloneBase(), "delete", remotePath(key), "--s3-no-check-bucket"],
      { timeout: 60_000 },
    );
  } catch {
    /* 삭제 실패 무시 — 다음 sweep 에서 재시도. 정본은 M2 라 안전. */
  }
}

/** TTL(기본 3일) 지난 객체 축출. launchd 크론 + 적재 시 기회적으로 호출. */
export async function sweepExpired(): Promise<number> {
  if (!r2Enabled()) return 0;
  const cutoff = new Date(Date.now() - TTL_MS);
  const rows = await db.select().from(r2Cache).where(lt(r2Cache.cachedAt, cutoff));
  for (const row of rows) {
    await r2DeleteKey(row.r2Key);
    await db.delete(r2Cache).where(eq(r2Cache.path, row.path));
  }
  return rows.length;
}

/** needed 바이트 자리 확보 — 오래된 것부터 축출해 총량+needed ≤ BUDGET 보장(예측 축출). */
async function evictToFit(needed: number): Promise<void> {
  let total = await totalBytes();
  if (total + needed <= BUDGET) return;
  const rows = await db.select().from(r2Cache).orderBy(asc(r2Cache.cachedAt));
  for (const row of rows) {
    if (total + needed <= BUDGET) break;
    await r2DeleteKey(row.r2Key);
    await db.delete(r2Cache).where(eq(r2Cache.path, row.path));
    total -= Number(row.bytes);
  }
}

/**
 * 공유된 영상을 R2 에 적재(이미 있으면 no-op). 넣기 전 만료 청소 + 예측 축출로 ≤ BUDGET 보장.
 * fire-and-forget 로 호출 — 실패해도 M2 가 서빙하므로 throw 하지 않는다.
 */
export async function cacheVideo(
  path: string,
  shareToken?: string | null,
): Promise<void> {
  try {
    if (!r2Enabled() || !isVideoPath(path)) return;
    const exist = await db
      .select()
      .from(r2Cache)
      .where(eq(r2Cache.path, path))
      .limit(1);
    if (exist[0]) return; // 이미 R2 에 있음

    let abs: string;
    let bytes: number;
    try {
      const { abs: a, stat } = await statPath(path);
      if (stat.isDirectory()) return;
      abs = a;
      bytes = stat.size;
    } catch {
      return; // 파일 없음
    }
    if (bytes <= 0 || bytes > BUDGET) return; // 단일 파일이 예산보다 크면 캐시 불가 → M2 서빙

    await sweepExpired(); // 만료분 먼저 비우고
    await evictToFit(bytes); // 자리 확보(≤ BUDGET)

    const key = r2KeyFor(path);
    await execFileP(
      RCLONE,
      [
        ...rcloneBase(),
        "copyto",
        abs,
        remotePath(key),
        "--s3-no-check-bucket",
        "--s3-chunk-size",
        "64M",
        "--s3-upload-concurrency",
        "8",
      ],
      { timeout: 30 * 60_000 },
    );
    await db
      .insert(r2Cache)
      .values({ path, r2Key: key, bytes, shareToken: shareToken ?? null })
      .onConflictDoNothing();
  } catch (e) {
    console.warn("[r2] cacheVideo failed:", path, (e as Error).message);
  }
}

/** 파일 삭제/교체/공유 해제 시 R2 에서도 제거(정본=M2 유지, 서빙은 자동 M2 폴백). */
export async function uncache(path: string): Promise<void> {
  try {
    if (!r2Enabled()) return;
    const rows = await db
      .select()
      .from(r2Cache)
      .where(eq(r2Cache.path, path))
      .limit(1);
    if (!rows[0]) return;
    await r2DeleteKey(rows[0].r2Key);
    await db.delete(r2Cache).where(eq(r2Cache.path, path));
  } catch (e) {
    console.warn("[r2] uncache failed:", path, (e as Error).message);
  }
}
