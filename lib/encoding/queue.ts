import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { encodingJobs, hlsAssets } from "@/lib/db/schema";
import { generateHLS, removeHLS } from "@/lib/fs/hls";
import { resolveSafePath } from "@/lib/fs/storage";

/**
 * HLS 인코딩 작업 큐.
 *
 * 모델:
 *  - DB(encoding_jobs)에 job 영속화 → 서버 재시작 후에도 큐 복원
 *  - 메모리에 활성 워커만 추적 (max 2)
 *  - FIFO + 작은 파일 우선 (큐 가로채기 방지)
 *
 * 동작:
 *  - enqueue() → DB insert + tryStart()
 *  - tryStart() → 활성 < MAX 면 다음 큐 잡 실행
 *  - 잡 종료 → DB 업데이트, hls_assets 등록, tryStart() 재호출
 *  - 서버 시작 시 hydrate() 로 미완료 큐 재시작
 */

const MAX_WORKERS = 2;

let activeWorkers = 0;
let starting = false;
let initialized = false;

export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type EncodingJobView = {
  id: string;
  filePath: string;
  fingerprint: string | null;
  status: JobStatus;
  progress: number;
  enqueuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  durationSec: number | null;
};

function toView(row: typeof encodingJobs.$inferSelect): EncodingJobView {
  return {
    id: row.id,
    filePath: row.filePath,
    fingerprint: row.fingerprint,
    status: row.status as JobStatus,
    progress: row.progress,
    enqueuedAt: row.enqueuedAt.getTime(),
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
    finishedAt: row.finishedAt ? row.finishedAt.getTime() : null,
    error: row.error,
    durationSec: row.durationSec,
  };
}

// 모듈 첫 로드 시 큐 hydrate (서버 시작 시 stuck running 잡 복원)
let hydratePromise: Promise<void> | null = null;
async function ensureHydrated(): Promise<void> {
  if (initialized) return;
  if (!hydratePromise) hydratePromise = hydrate();
  await hydratePromise;
}

/** 영상 경로를 큐에 추가 (이미 변환됐거나 큐에 있으면 skip) */
export async function enqueue(filePath: string): Promise<EncodingJobView | null> {
  await ensureHydrated();

  // macOS find/finder 가 NFD 로 한글 자모 분해해서 보내는 경우 있음 →
  // DB·웹 업로드는 NFC 라 일치 검사 실패. 입구에서 NFC 로 통일.
  filePath = filePath.normalize("NFC");

  // 이미 변환 완료된 경우
  const existing = await db
    .select()
    .from(hlsAssets)
    .where(eq(hlsAssets.filePath, filePath))
    .limit(1);
  if (existing.length > 0) return null;

  // 이미 큐에 있는 경우
  const inQueue = await db
    .select()
    .from(encodingJobs)
    .where(
      and(
        eq(encodingJobs.filePath, filePath),
        inArray(encodingJobs.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  if (inQueue.length > 0) return toView(inQueue[0]);

  const id = randomUUID();
  await db.insert(encodingJobs).values({
    id,
    filePath,
    status: "queued",
    progress: 0,
  });
  void tryStart();

  const [row] = await db
    .select()
    .from(encodingJobs)
    .where(eq(encodingJobs.id, id))
    .limit(1);
  return row ? toView(row) : null;
}

/** 큐에서 다음 잡 가져와 실행 (반복) */
async function tryStart(): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    while (activeWorkers < MAX_WORKERS) {
      const [next] = await db
        .select()
        .from(encodingJobs)
        .where(eq(encodingJobs.status, "queued"))
        .orderBy(encodingJobs.enqueuedAt)
        .limit(1);
      if (!next) break;

      // running 으로 마킹 후 비동기 실행
      await db
        .update(encodingJobs)
        .set({ status: "running", startedAt: new Date(), progress: 0 })
        .where(eq(encodingJobs.id, next.id));
      activeWorkers++;
      void runJob(next.id, next.filePath);
    }
  } finally {
    starting = false;
  }
}

async function runJob(jobId: string, filePath: string): Promise<void> {
  // hls_assets 키는 항상 NFC. encoding_jobs 가 NFD 인 경우라도 정규화 후 저장.
  const nfcPath = filePath.normalize("NFC");
  try {
    const absPath = resolveSafePath(filePath);
    const result = await generateHLS(absPath, async (pct) => {
      // 진행률 업데이트 (5% 단위로 throttle)
      try {
        await db
          .update(encodingJobs)
          .set({ progress: pct })
          .where(eq(encodingJobs.id, jobId));
      } catch {}
    });

    await db
      .insert(hlsAssets)
      .values({
        fingerprint: result.fingerprint,
        filePath: nfcPath,
        segmentCount: result.segmentCount,
        totalBytes: result.totalBytes,
        durationSec: result.durationSec,
      })
      .onConflictDoUpdate({
        target: hlsAssets.filePath,
        set: {
          fingerprint: result.fingerprint,
          segmentCount: result.segmentCount,
          totalBytes: result.totalBytes,
          durationSec: result.durationSec,
        },
      });

    await db
      .update(encodingJobs)
      .set({
        status: "done",
        progress: 100,
        finishedAt: new Date(),
        fingerprint: result.fingerprint,
        durationSec: result.durationSec,
      })
      .where(eq(encodingJobs.id, jobId));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    await db
      .update(encodingJobs)
      .set({ status: "failed", finishedAt: new Date(), error: msg.slice(0, 1000) })
      .where(eq(encodingJobs.id, jobId))
      .catch(() => {});
  } finally {
    activeWorkers--;
    void tryStart();
  }
}

/**
 * 서버 시작 시 호출 — DB에 running 상태로 남은 잡들을 다시 큐에 올림.
 * (이전 프로세스가 인코딩 중 죽었을 가능성)
 */
export async function hydrate(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // running 상태 → queued 로 되돌림 (재시도)
  const stuck = await db
    .select()
    .from(encodingJobs)
    .where(eq(encodingJobs.status, "running"));
  if (stuck.length > 0) {
    await db
      .update(encodingJobs)
      .set({ status: "queued", progress: 0, startedAt: null })
      .where(eq(encodingJobs.status, "running"));
  }

  void tryStart();
}

/** 특정 파일의 인코딩 상태 조회 (UI 배지용) */
export async function getJobByPath(
  filePath: string,
): Promise<EncodingJobView | null> {
  await ensureHydrated();
  const nfc = filePath.normalize("NFC");
  const [row] = await db
    .select()
    .from(encodingJobs)
    .where(eq(encodingJobs.filePath, nfc))
    .orderBy(encodingJobs.enqueuedAt)
    .limit(1);
  return row ? toView(row) : null;
}

export async function getQueueSnapshot(): Promise<{
  active: number;
  queued: number;
  recentDone: number;
  failed: number;
}> {
  // 어떤 진입점에서든 hydrate 보장 — 안 그러면 PM2 재시작 후 stuck running 잡이 영원히 안 잡힘
  await ensureHydrated();
  const [running, queued, done, failed] = await Promise.all([
    db.select().from(encodingJobs).where(eq(encodingJobs.status, "running")),
    db.select().from(encodingJobs).where(eq(encodingJobs.status, "queued")),
    db
      .select()
      .from(encodingJobs)
      .where(eq(encodingJobs.status, "done"))
      .limit(50),
    db
      .select()
      .from(encodingJobs)
      .where(eq(encodingJobs.status, "failed"))
      .limit(50),
  ]);
  return {
    active: running.length,
    queued: queued.length,
    recentDone: done.length,
    failed: failed.length,
  };
}
