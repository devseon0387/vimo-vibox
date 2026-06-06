import fs from "node:fs/promises";
import path from "node:path";
import { inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  comments,
  fileUploads,
  scanHistory,
  shareLinks,
  trafficLog,
} from "@/lib/db/schema";
import {
  getStorageRoot,
  getZoneRoot,
  parseZoneFromPath,
  resolveSafePath,
  type Zone,
} from "@/lib/fs/storage";
import { thumbHash } from "@/lib/fs/thumbnail";

const CHUNK_STALE_HOURS = 24;
const TRAFFIC_LOG_RETENTION_DAYS = 90;
const LEGACY_DIR = ".vimo-cloud"; // 이전 이름 (vimo-cloud → vibox 변경 전)

export type ReconcileReport = {
  applied: boolean;
  legacyDir: { path: string; sizeBytes: number; files: number } | null;
  orphanThumbs: { path: string; sizeBytes: number }[];
  orphanChunks: {
    fileId: string;
    sizeBytes: number;
    ageHours: number;
    filename?: string;
  }[];
  orphanDb: {
    comments: string[];
    fileUploads: string[];
    shareLinks: { id: string; filePath: string }[];
    scanHistory: string[];
  };
  oldTrafficLogs: number;
  totalBytesFreed: number;
  liveFileCount: number;
  // zone별 디스크 라이브 파일 수 (rendering/library/personal). 마운트 건강 진단용.
  liveByZone: Record<string, number>;
  // DB 가 참조하는데 디스크 라이브 파일이 0개인 zone (언마운트/소실 의심).
  // apply 모드에선 이 목록이 비어있지 않으면 삭제를 거부하고 throw 한다.
  suspectZones: string[];
  storageSuspect: boolean;
};

// readdir 실패를 "치명"으로 볼지 판정.
// - ENOENT(부재): 정상 — 미사용 zone(아직 안 만든 Library 등) 또는 삭제된 폴더(= 고아 탐지 대상). 빈 목록 처리.
// - 그 외(ENOTDIR·EACCES·EPERM·EIO·ENOTCONN·EBUSY·미상): 치명.
//   * walk()는 isDirectory() 통과한 항목만 재귀하므로 ENOTDIR 는 사실상 zone root 가 디렉터리가
//     아닌 손상 상태(잘못된 remount 등)에서만 발생 → 치명 처리.
//   * 접근불가/IO 는 "파일이 있는데 못 읽는" 상태(언마운트·TCC). 조용히 [] 반환 시 그 zone 의
//     모든 DB 행이 고아로 오분류 → --apply 전삭제 footgun.
export function isFatalReaddirError(code: string | undefined): boolean {
  return code !== "ENOENT";
}

// 스토리지 디렉터리가 부재가 아닌 사유로 읽히지 않을 때(언마운트·권한·손상) 던진다 → reconcile 중단.
export class StorageUnreadableError extends Error {
  constructor(absPath: string, code: string | undefined) {
    super(
      `스토리지 디렉터리를 읽을 수 없습니다 (${code ?? "unknown"}): ${absPath} — ` +
        `볼륨 언마운트 또는 권한(TCC)·손상 문제일 수 있습니다. 고아 오분류 방지를 위해 중단합니다.`,
    );
    this.name = "StorageUnreadableError";
  }
}

// reconcile 은 notes zone(개발 .md)을 소유하지 않는다(note_index/note_versions 가 관리).
// collectLiveFiles 도 notes 를 걷지 않으므로, /notes 경로를 고아 분류에 넣으면 매 실행 무조건
// 삭제돼버린다 → 고아 후보에서 제외해 데이터 손실을 막는다. (parseZoneFromPath 는 /notes 를
// rendering 으로 매핑하므로 zone 가드로는 못 걸러짐 — 명시적 제외 필요.)
export function isNotesPath(p: string): boolean {
  return p === "/notes" || p.startsWith("/notes/");
}

// 라이브 파일 목록에서 모든 조상 디렉터리 경로 집합을 만든다.
// 폴더 공유(share_links.filePath = 디렉터리)는 liveSet(파일 전용)에 없어서 매 apply 마다
// 고아로 삭제되던 버그가 있었다 → 디렉터리는 그 밑에 라이브 파일이 있으면 살아있는 것으로 본다.
export function buildLiveDirs(liveFiles: Iterable<string>): Set<string> {
  const dirs = new Set<string>();
  for (const f of liveFiles) {
    let dir = f;
    let i = dir.lastIndexOf("/");
    while (i > 0) {
      dir = dir.slice(0, i);
      if (dirs.has(dir)) break; // 이미 추가됨 → 상위 조상도 전부 있음
      dirs.add(dir);
      i = dir.lastIndexOf("/");
    }
  }
  return dirs;
}

export type ZoneStat = { live: number; dbRefs: number; orphans: number };

// 핵심 안전장치: zone 이 언마운트/소실됐을 가능성을 두 신호로 판정한다.
//  (1) 완전 붕괴 — DB 가 참조하는데 디스크 라이브 파일이 0개 (live===0).
//  (2) 부분 붕괴 — DB 참조가 floor 이상인데 그중 ratio 이상이 고아.
//      ('count===0' 이진 가드는 마운트포인트에 stray 파일 1개만 남아도 우회됨. 특히 rendering 은
//       STORAGE_ROOT 자체이자 catch-all 이라 DB 행이 가장 많이 쌓여 위험.)
// 어느 쪽이든 그 zone 의 DB 행 전부가 고아로 몰살되는 사고를 막기 위해 의심 zone 으로 보고한다.
export function findSuspectZones(
  stats: Record<string, ZoneStat>,
  floor = 10,
  ratio = 0.9,
): string[] {
  const suspect: string[] = [];
  for (const [zone, s] of Object.entries(stats)) {
    if (s.dbRefs === 0) continue;
    const fullyGone = s.live === 0;
    const mostlyGone = s.orphans >= floor && s.orphans >= s.dbRefs * ratio;
    if (fullyGone || mostlyGone) suspect.push(zone);
  }
  return suspect;
}

// 단일 디렉터리 트리에서 파일 상대 경로를 prefix 붙여 수집.
// readdir 가 ENOENT(부재) 이외의 사유로 실패하면 StorageUnreadableError 를 던진다
// (언마운트·TCC·손상 시 빈 목록 반환 → DB 행 고아 몰살 footgun 봉쇄). root·하위 디렉터리 동일 적용.
export async function walkZone(absRoot: string, urlPrefix: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(abs: string, rel: string) {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch (e: unknown) {
      const code = (e as { code?: string } | null)?.code;
      if (isFatalReaddirError(code)) throw new StorageUnreadableError(abs, code);
      return; // 부재 → 파일 없음으로 취급 (정상)
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel === "" ? "/" + e.name : rel + "/" + e.name;
      if (e.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (e.isFile()) {
        result.push(urlPrefix + childRel);
      }
    }
  }
  await walk(absRoot, "");
  return result;
}

// SSD에 실제 존재하는 모든 파일을 3 zone (rendering/library/personal) 통합 수집.
// URL 표기 그대로 (rendering="/foo.mp4", library="/library/...", personal="/personal/...")
async function collectLiveFiles(): Promise<string[]> {
  const [rendering, library, personal] = await Promise.all([
    walkZone(getZoneRoot("rendering"), ""),
    walkZone(getZoneRoot("library"), "/library"),
    walkZone(getZoneRoot("personal"), "/personal"),
  ]);
  return [...rendering, ...library, ...personal];
}

async function dirSize(abs: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  async function walk(p: string) {
    let entries;
    try {
      entries = await fs.readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const s = await fs.stat(full);
          bytes += s.size;
          files += 1;
        } catch {}
      }
    }
  }
  await walk(abs);
  return { bytes, files };
}

// URL 경로가 디스크에 실제로 존재하는지(파일이든 디렉터리든). 폴더 공유 보존 판정용.
async function pathExistsOnDisk(p: string): Promise<boolean> {
  try {
    await fs.stat(resolveSafePath(p));
    return true;
  } catch {
    return false;
  }
}

// Parse comma-separated JSON paths safely (share_links.paths = JSON array or null)
function parsePathsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function runReconcile(opts: {
  apply: boolean;
}): Promise<ReconcileReport> {
  const root = getStorageRoot();
  // 언마운트/TCC/손상 시 collectLiveFiles 가 StorageUnreadableError 를 던진다(하드 FS 오류).
  // 단, "빈 placeholder 마운트포인트"(readdir 성공·[] 반환)나 zone root ENOENT 는 throw 안 하므로,
  // 아래 zone별 liveByZone + findSuspectZones 로 "부분 붕괴"까지 잡는다.
  const liveFiles = await collectLiveFiles();
  const liveSet = new Set(liveFiles);
  const liveHashSet = new Set(liveFiles.map((p) => thumbHash(p)));
  // 폴더 공유(filePath=디렉터리)가 liveSet(파일 전용)에 없어서 매 apply 마다 고아로 삭제되던
  // 버그 차단용. 디렉터리는 그 밑에 라이브 파일이 있으면 살아있음.
  const liveDirs = buildLiveDirs(liveFiles);
  // 경로가 디스크에 살아있는가: 라이브 파일이거나, 라이브 파일을 품은 디렉터리.
  const present = (p: string) => liveSet.has(p) || liveDirs.has(p);

  // zone별 디스크 라이브 파일 수 — 마운트 건강 판정의 기준.
  const liveByZone: Record<string, number> = {};
  for (const p of liveFiles) {
    const { zone } = parseZoneFromPath(p);
    liveByZone[zone] = (liveByZone[zone] ?? 0) + 1;
  }

  // ─── 1) 레거시 디렉터리 (.vimo-cloud/) 전체 ───
  const legacyAbs = path.join(root, LEGACY_DIR);
  let legacy: ReconcileReport["legacyDir"] = null;
  try {
    const stat = await fs.stat(legacyAbs);
    if (stat.isDirectory()) {
      const { bytes, files } = await dirSize(legacyAbs);
      legacy = { path: LEGACY_DIR, sizeBytes: bytes, files };
    }
  } catch {
    /* 없으면 무시 */
  }

  // ─── 2) 고아 썸네일 (.vibox/thumbs/*.jpg) ───
  const thumbRoot = path.join(root, ".vibox", "thumbs");
  const orphanThumbs: ReconcileReport["orphanThumbs"] = [];
  try {
    const entries = await fs.readdir(thumbRoot);
    for (const name of entries) {
      if (!name.endsWith(".jpg")) continue;
      // 파일명: {hash16}.jpg 또는 {hash16}_{sec}.jpg
      const base = name.slice(0, -4);
      const hashPart = base.split("_")[0];
      if (hashPart.length !== 16) continue; // 형식 안 맞으면 스킵
      if (!liveHashSet.has(hashPart)) {
        const abs = path.join(thumbRoot, name);
        try {
          const s = await fs.stat(abs);
          orphanThumbs.push({
            path: path.join(".vibox/thumbs", name),
            sizeBytes: s.size,
          });
        } catch {}
      }
    }
  } catch {
    /* 썸네일 폴더 없으면 무시 */
  }

  // ─── 3) 고아 청크 업로드 (.vibox/uploads/<fileId>/) ───
  const uploadRoot = path.join(root, ".vibox", "uploads");
  const orphanChunks: ReconcileReport["orphanChunks"] = [];
  const now = Date.now();
  try {
    const dirs = await fs.readdir(uploadRoot, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const sessionDir = path.join(uploadRoot, d.name);
      let createdAt: number | null = null;
      let filename: string | undefined;
      try {
        const metaRaw = await fs.readFile(
          path.join(sessionDir, ".meta.json"),
          "utf-8",
        );
        const meta = JSON.parse(metaRaw);
        createdAt = Number(meta?.createdAt) || null;
        filename = typeof meta?.filename === "string" ? meta.filename : undefined;
      } catch {
        // meta.json 없으면 생성 시각을 dir mtime으로
        try {
          const s = await fs.stat(sessionDir);
          createdAt = s.mtimeMs;
        } catch {}
      }
      if (createdAt === null) continue;
      const ageHours = (now - createdAt) / 3_600_000;
      if (ageHours < CHUNK_STALE_HOURS) continue;

      const { bytes } = await dirSize(sessionDir);
      orphanChunks.push({
        fileId: d.name,
        sizeBytes: bytes,
        ageHours: Math.round(ageHours * 10) / 10,
        filename,
      });
    }
  } catch {
    /* uploads 폴더 없으면 무시 */
  }

  // ─── 4) DB 고아 행 ───
  // comments
  const commentPaths = await db
    .selectDistinct({ path: comments.filePath })
    .from(comments);
  const orphanCommentPaths = commentPaths
    .map((r) => r.path)
    .filter((p) => !liveSet.has(p) && !isNotesPath(p));

  // file_uploads
  const uploadRows = await db.select({ path: fileUploads.path }).from(fileUploads);
  const orphanUploadPaths = uploadRows
    .map((r) => r.path)
    .filter((p) => !liveSet.has(p) && !isNotesPath(p));

  // share_links (filePath + paths JSON 전부 검증)
  const shareRows = await db
    .select({
      id: shareLinks.id,
      filePath: shareLinks.filePath,
      paths: shareLinks.paths,
    })
    .from(shareLinks);
  // present() 로는 안 잡히지만 디스크엔 실제 존재하는 경로(주로 빈 폴더 공유). 공유 루프에서 채워,
  // 아래 zoneStats 고아 집계가 공유 보존 기준과 동일하게 판단하도록 공유한다(오탐 abort 방지).
  const diskPresent = new Set<string>();
  const sharePathsById = new Map<string, string[]>();
  const orphanShareLinks: ReconcileReport["orphanDb"]["shareLinks"] = [];
  for (const r of shareRows) {
    const all = [r.filePath, ...parsePathsJson(r.paths)];
    sharePathsById.set(r.id, all);
    // notes 경로를 가리키는 공유는 reconcile 관리 대상 아님 → 고아 분류에서 제외.
    if (all.some(isNotesPath)) continue;
    // 1차: 라이브 파일/디렉터리면 살아있음 (폴더 공유 filePath=디렉터리는 liveDirs 로 잡힘).
    if (all.some(present)) continue;
    // 2차: 빈 폴더 공유 등 liveDirs 에 안 잡히는 경우 디스크 직접 확인 — 하나라도 존재하면 보존.
    const onDisk = await Promise.all(all.map(pathExistsOnDisk));
    all.forEach((p, i) => {
      if (onDisk[i]) diskPresent.add(p);
    });
    if (onDisk.some(Boolean)) continue;
    orphanShareLinks.push({ id: r.id, filePath: r.filePath });
  }

  // scan_history
  const scanRows = await db
    .selectDistinct({ path: scanHistory.filePath })
    .from(scanHistory);
  const orphanScanPaths = scanRows
    .map((r) => r.path)
    .filter((p) => !liveSet.has(p) && !isNotesPath(p));

  // 오래된 트래픽 로그 개수
  const trafficCutoff = new Date(
    now - TRAFFIC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const oldTrafficCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(trafficLog)
    .where(lt(trafficLog.at, trafficCutoff));
  const oldTrafficCount = Number(oldTrafficCountRow[0]?.n ?? 0);

  // ─── 마운트 건강 진단 (부분 붕괴 footgun 차단) ───
  // zone별 live(디스크 파일수)·dbRefs(DB 참조 distinct 경로)·orphans(그중 부재)를 집계해,
  // 완전 붕괴(live===0) 또는 부분 붕괴(대부분 고아)인 zone 을 의심으로 본다. (findSuspectZones)
  // (예: rendering 은 정상인데 Personal 마운트포인트가 빈 placeholder → /personal/* DB 행 전멸,
  //  또는 마운트 루트에 stray 파일 1개만 남아 rendering DB 행 수천 개가 통째로 고아 분류)
  const zoneStats: Record<string, ZoneStat> = {};
  const ensureZone = (z: string): ZoneStat =>
    (zoneStats[z] ??= { live: 0, dbRefs: 0, orphans: 0 });
  for (const z of Object.keys(liveByZone)) ensureZone(z).live = liveByZone[z];
  const seenDbPath = new Set<string>();
  const accountDbPath = (p: string) => {
    if (isNotesPath(p) || seenDbPath.has(p)) return;
    seenDbPath.add(p);
    const s = ensureZone(parseZoneFromPath(p).zone);
    s.dbRefs += 1;
    // 공유 루프와 동일 기준: 라이브 파일/디렉터리거나 디스크에 존재하면 고아 아님.
    if (!present(p) && !diskPresent.has(p)) s.orphans += 1;
  };
  commentPaths.forEach((r) => accountDbPath(r.path));
  uploadRows.forEach((r) => accountDbPath(r.path));
  scanRows.forEach((r) => accountDbPath(r.path));
  for (const r of shareRows) {
    for (const p of sharePathsById.get(r.id) ?? []) accountDbPath(p);
  }
  const suspectZones = findSuspectZones(zoneStats);
  const storageSuspect = suspectZones.length > 0;

  // ─── 총합 ───
  const totalBytesFreed =
    (legacy?.sizeBytes ?? 0) +
    orphanThumbs.reduce((s, t) => s + t.sizeBytes, 0) +
    orphanChunks.reduce((s, c) => s + c.sizeBytes, 0);

  // ─── 실행 (apply) ───
  if (opts.apply) {
    // 전역 백스톱: 디스크 라이브 파일이 0개면(전체 언마운트 의심) DB 가 비어 suspect 가 안 떠도
    // 썸네일/청크/레거시가 전부 고아로 분류돼 삭제될 수 있다 → 무조건 거부.
    if (liveFiles.length === 0) {
      throw new Error(
        `reconcile 중단(apply): 디스크 라이브 파일이 0개입니다 — 스토리지 볼륨 언마운트 의심. ` +
          `썸네일·청크·DB 가 통째로 삭제되는 사고를 막기 위해 중단합니다. ` +
          `STORAGE_ROOT(${root}) 마운트 상태를 확인 후 재시도하세요.`,
      );
    }
    // 마운트 의심 시 삭제 거부 (apply 한정). dry-run 은 통과시켜 storageSuspect 리포트로 진단 가능.
    if (storageSuspect) {
      throw new Error(
        `reconcile 중단(apply): 다음 zone 이 디스크에서 거의/전부 사라졌습니다(언마운트·소실 의심): ` +
          `[${suspectZones.join(", ")}]. ` +
          `해당 zone 의 DB 행이 통째로 고아로 삭제되는 사고를 막기 위해 중단합니다. ` +
          `STORAGE_ROOT(${root}) 마운트 상태를 확인 후 재시도하세요.`,
      );
    }
    if (legacy) {
      await fs.rm(legacyAbs, { recursive: true, force: true });
    }
    for (const t of orphanThumbs) {
      await fs.rm(path.join(root, t.path), { force: true });
    }
    for (const c of orphanChunks) {
      await fs.rm(path.join(uploadRoot, c.fileId), {
        recursive: true,
        force: true,
      });
    }
    if (orphanCommentPaths.length > 0) {
      await db.delete(comments).where(inArray(comments.filePath, orphanCommentPaths));
    }
    if (orphanUploadPaths.length > 0) {
      await db
        .delete(fileUploads)
        .where(inArray(fileUploads.path, orphanUploadPaths));
    }
    if (orphanShareLinks.length > 0) {
      await db
        .delete(shareLinks)
        .where(inArray(shareLinks.id, orphanShareLinks.map((s) => s.id)));
    }
    if (orphanScanPaths.length > 0) {
      await db
        .delete(scanHistory)
        .where(inArray(scanHistory.filePath, orphanScanPaths));
    }
    if (oldTrafficCount > 0) {
      await db.delete(trafficLog).where(lt(trafficLog.at, trafficCutoff));
    }
  }

  return {
    applied: opts.apply,
    legacyDir: legacy,
    orphanThumbs,
    orphanChunks,
    orphanDb: {
      comments: orphanCommentPaths,
      fileUploads: orphanUploadPaths,
      shareLinks: orphanShareLinks,
      scanHistory: orphanScanPaths,
    },
    oldTrafficLogs: oldTrafficCount,
    totalBytesFreed,
    liveFileCount: liveFiles.length,
    liveByZone,
    suspectZones,
    storageSuspect,
  };
}

export function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
