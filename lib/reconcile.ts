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
import { getStorageRoot } from "@/lib/fs/storage";
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
};

// SSD에 실제 존재하는 모든 파일의 상대 경로를 재귀 수집 (dot 디렉터리 제외)
async function collectLiveFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(abs: string, rel: string) {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = rel === "/" ? "/" + e.name : rel + "/" + e.name;
      if (e.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (e.isFile()) {
        result.push(childRel);
      }
    }
  }
  await walk(root, "/");
  return result;
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
  const liveFiles = await collectLiveFiles(root);
  const liveSet = new Set(liveFiles);
  const liveHashSet = new Set(liveFiles.map((p) => thumbHash(p)));

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
    .filter((p) => !liveSet.has(p));

  // file_uploads
  const uploadRows = await db.select({ path: fileUploads.path }).from(fileUploads);
  const orphanUploadPaths = uploadRows
    .map((r) => r.path)
    .filter((p) => !liveSet.has(p));

  // share_links (filePath + paths JSON 전부 검증)
  const shareRows = await db
    .select({
      id: shareLinks.id,
      filePath: shareLinks.filePath,
      paths: shareLinks.paths,
    })
    .from(shareLinks);
  const orphanShareLinks: ReconcileReport["orphanDb"]["shareLinks"] = [];
  for (const r of shareRows) {
    const all = [r.filePath, ...parsePathsJson(r.paths)];
    const allGone = all.every((p) => !liveSet.has(p));
    if (allGone) orphanShareLinks.push({ id: r.id, filePath: r.filePath });
  }

  // scan_history
  const scanRows = await db
    .selectDistinct({ path: scanHistory.filePath })
    .from(scanHistory);
  const orphanScanPaths = scanRows
    .map((r) => r.path)
    .filter((p) => !liveSet.has(p));

  // 오래된 트래픽 로그 개수
  const trafficCutoff = new Date(
    now - TRAFFIC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const oldTrafficCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(trafficLog)
    .where(lt(trafficLog.at, trafficCutoff));
  const oldTrafficCount = Number(oldTrafficCountRow[0]?.n ?? 0);

  // ─── 총합 ───
  const totalBytesFreed =
    (legacy?.sizeBytes ?? 0) +
    orphanThumbs.reduce((s, t) => s + t.sizeBytes, 0) +
    orphanChunks.reduce((s, c) => s + c.sizeBytes, 0);

  // ─── 실행 (apply) ───
  if (opts.apply) {
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
