import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { Stats } from "node:fs";

/**
 * 스토리지 영역(Zone).
 * - rendering : 비모 팀 검수 파이프라인 (기존 /Shared/). prefix 없는 레거시 경로도 여기로 폴백.
 * - library   : 자료실 (팀 공용 레퍼런스 — staff만 쓰기)
 * - personal  : 개인 드라이브 (/personal/{userId}/...)
 */
export type Zone = "rendering" | "library" | "personal";

/** rendering zone 의 디스크 루트 = STORAGE_ROOT env */
export function getStorageRoot(): string {
  const root = process.env.STORAGE_ROOT;
  if (!root) throw new Error("STORAGE_ROOT env not set");
  return path.resolve(root);
}

/** zone별 디스크 루트 반환. rendering = STORAGE_ROOT, 나머지는 STORAGE_ROOT 의 부모(base)에서 sibling. */
export function getZoneRoot(zone: Zone): string {
  const renderingRoot = getStorageRoot();
  if (zone === "rendering") return renderingRoot;
  const base = path.dirname(renderingRoot);
  if (zone === "library") return path.join(base, "Library");
  if (zone === "personal") return path.join(base, "Personal");
  throw new Error(`unknown zone: ${zone}`);
}

/**
 * 상대 경로에서 zone 추출.
 * - /library/... → library zone
 * - /personal/... → personal zone
 * - 그 외 (레거시 /foo.mp4 포함) → rendering zone
 */
export function parseZoneFromPath(relativePath: string): {
  zone: Zone;
  sub: string;
} {
  const normalized =
    relativePath.startsWith("/") ? relativePath : "/" + relativePath;
  if (normalized === "/library" || normalized.startsWith("/library/")) {
    return { zone: "library", sub: normalized.slice("/library".length) || "/" };
  }
  if (normalized === "/personal" || normalized.startsWith("/personal/")) {
    return { zone: "personal", sub: normalized.slice("/personal".length) || "/" };
  }
  return { zone: "rendering", sub: normalized };
}

/** personal zone 소유자 ID 추출. /personal/{userId}/... → userId */
export function personalOwnerOf(relativePath: string): string | null {
  const { zone, sub } = parseZoneFromPath(relativePath);
  if (zone !== "personal") return null;
  const parts = sub.split("/").filter(Boolean);
  return parts[0] ?? null;
}

/**
 * URL 경로를 받아 실제 파일시스템 절대 경로로 변환.
 * zone 인식 + path traversal(../) 방지.
 */
export function resolveSafePath(relativePath: string): string {
  const { zone, sub } = parseZoneFromPath(relativePath.replace(/\\/g, "/"));
  const root = getZoneRoot(zone);
  const normalized = path.posix.normalize(sub.startsWith("/") ? sub : "/" + sub);
  const absolute = path.join(root, normalized);

  // 반드시 zone root 하위여야 함
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Invalid path: ${relativePath}`);
  }
  return absolute;
}

export type FileEntry = {
  name: string;
  path: string; // 상대 경로 (/로 시작)
  isFolder: boolean;
  size: number;
  modifiedAt: number; // unix ms
  kind: "folder" | "video" | "image" | "doc" | "zip" | "audio" | "other";
  mime?: string;
};

function detectKind(name: string, isFolder: boolean): FileEntry["kind"] {
  if (isFolder) return "folder";
  const ext = path.extname(name).toLowerCase().slice(1);
  if (["mp4", "mov", "mkv", "avi", "webm", "m4v"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp"].includes(ext)) return "image";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "zip";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv"].includes(ext)) return "doc";
  return "other";
}

export async function ensureDir(relativePath: string): Promise<void> {
  const abs = resolveSafePath(relativePath);
  await fs.mkdir(abs, { recursive: true });
}

export async function listDirectory(relativePath: string): Promise<FileEntry[]> {
  const abs = resolveSafePath(relativePath);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      await fs.mkdir(abs, { recursive: true });
      return [];
    }
    throw e;
  }

  const results = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith("."))
      .map(async (e) => {
        const full = path.join(abs, e.name);
        let stat: Stats;
        try {
          stat = await fs.stat(full);
        } catch {
          return null;
        }
        const isFolder = stat.isDirectory();
        const rel =
          path.posix.join(
            relativePath.startsWith("/") ? relativePath : "/" + relativePath,
            e.name,
          );
        return {
          name: e.name,
          path: rel,
          isFolder,
          size: isFolder ? 0 : stat.size,
          modifiedAt: stat.mtimeMs,
          kind: detectKind(e.name, isFolder),
        } satisfies FileEntry;
      }),
  );

  return results
    .filter((r): r is FileEntry => r !== null)
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
}

export async function statPath(relativePath: string) {
  const abs = resolveSafePath(relativePath);
  const stat = await fs.stat(abs);
  return { abs, stat };
}

export async function createFolder(relativePath: string): Promise<void> {
  const abs = resolveSafePath(relativePath);
  await fs.mkdir(abs, { recursive: false });
}

export async function deleteEntry(relativePath: string): Promise<void> {
  const abs = resolveSafePath(relativePath);
  // 안전: root 자체 삭제 막기
  if (abs === getStorageRoot()) throw new Error("Cannot delete storage root");
  await fs.rm(abs, { recursive: true, force: false });
}

/** 이름 변경 혹은 이동 (fs.rename). from/to 모두 상대 경로. */
export async function moveEntry(from: string, to: string): Promise<void> {
  const absFrom = resolveSafePath(from);
  const absTo = resolveSafePath(to);
  if (absFrom === getStorageRoot()) throw new Error("Cannot move root");
  // 대상이 이미 존재하면 에러
  try {
    await fs.access(absTo);
    throw new Error("Target already exists");
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT" && err.message !== "Target already exists") {
      /* pass */
    } else if (err.message === "Target already exists") {
      throw err;
    }
  }
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.rename(absFrom, absTo);
}

/** 파일명 부분 일치 재귀 검색 (최대 1000개, 10단계). */
export async function searchFiles(
  query: string,
  maxResults = 300,
  maxDepth = 10,
): Promise<FileEntry[]> {
  const root = getStorageRoot();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: FileEntry[] = [];

  async function walk(abs: string, rel: string, depth: number) {
    if (results.length >= maxResults || depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= maxResults) break;
      if (e.name.startsWith(".")) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = path.posix.join(rel, e.name);
      let stat;
      try {
        stat = await fs.stat(childAbs);
      } catch {
        continue;
      }
      const isFolder = stat.isDirectory();
      if (e.name.toLowerCase().includes(q)) {
        results.push({
          name: e.name,
          path: childRel,
          isFolder,
          size: isFolder ? 0 : stat.size,
          modifiedAt: stat.mtimeMs,
          kind: detectKind(e.name, isFolder),
        });
      }
      if (isFolder) await walk(childAbs, childRel, depth + 1);
    }
  }

  await walk(root, "/", 0);
  return results;
}

export async function saveFile(
  relativeDir: string,
  filename: string,
  data: Uint8Array | Buffer,
): Promise<FileEntry> {
  const absDir = resolveSafePath(relativeDir);
  await fs.mkdir(absDir, { recursive: true });
  const absFile = path.join(absDir, filename);
  // 중복 파일명이면 숫자 붙여서
  const finalPath = await uniquePath(absFile);
  await fs.writeFile(finalPath, data);
  const stat = await fs.stat(finalPath);
  const finalName = path.basename(finalPath);
  return {
    name: finalName,
    path: path.posix.join(relativeDir.startsWith("/") ? relativeDir : "/" + relativeDir, finalName),
    isFolder: false,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    kind: detectKind(finalName, false),
  };
}

async function uniquePath(abs: string): Promise<string> {
  try {
    await fs.access(abs);
  } catch {
    return abs; // 존재 안 함, 그대로
  }
  const ext = path.extname(abs);
  const base = abs.slice(0, -ext.length);
  let i = 1;
  while (i < 1000) {
    const cand = `${base} (${i})${ext}`;
    try {
      await fs.access(cand);
    } catch {
      return cand;
    }
    i++;
  }
  throw new Error("too many duplicates");
}

export function streamFile(abs: string) {
  return createReadStream(abs);
}

// ============================================================
// 청크 업로드 지원
// ============================================================

export type ConflictMode = "overwrite" | "autonumber" | "skip";

export type ChunkUploadMeta = {
  fileId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  targetPath: string; // 상대 경로 (상위 폴더)
  userId: string;
  createdAt: number;
  /** 같은 이름 파일 충돌 시 처리 방식. 미지정 = autonumber (하위호환) */
  conflictMode?: ConflictMode;
  /** 외부 ERP(파트너 ERP) 연동 메타 — fileUploads에 함께 저장됨 */
  episodeId?: string;
  projectId?: string;
  partnerId?: string;
};

/** 청크 임시 저장소 루트 (STORAGE_ROOT 안, 점으로 시작해 listDirectory에서 필터됨) */
export function getUploadTempRoot(): string {
  return path.join(getStorageRoot(), ".vibox", "uploads");
}

export function getUploadTempDir(fileId: string): string {
  if (!/^[a-f0-9-]{30,}$/i.test(fileId)) {
    throw new Error("invalid fileId");
  }
  return path.join(getUploadTempRoot(), fileId);
}

export async function initChunkSession(meta: ChunkUploadMeta): Promise<void> {
  const dir = getUploadTempDir(meta.fileId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, ".meta.json"), JSON.stringify(meta), "utf-8");
}

export async function getChunkSession(fileId: string): Promise<ChunkUploadMeta | null> {
  try {
    const dir = getUploadTempDir(fileId);
    const raw = await fs.readFile(path.join(dir, ".meta.json"), "utf-8");
    return JSON.parse(raw) as ChunkUploadMeta;
  } catch {
    return null;
  }
}

function chunkFilename(index: number): string {
  return `part-${index.toString().padStart(8, "0")}`;
}

export function getChunkPath(fileId: string, index: number): string {
  return path.join(getUploadTempDir(fileId), chunkFilename(index));
}

/** 청크들을 순서대로 합쳐 최종 파일로 이동. 결과 FileEntry 반환. */
export async function finalizeChunkUpload(fileId: string): Promise<FileEntry> {
  const meta = await getChunkSession(fileId);
  if (!meta) throw new Error("no upload session");

  const tempDir = getUploadTempDir(fileId);
  const entries = await fs.readdir(tempDir);
  const partFiles = entries
    .filter((n) => n.startsWith("part-"))
    .sort();

  if (partFiles.length !== meta.totalChunks) {
    throw new Error(
      `chunk count mismatch: expected ${meta.totalChunks}, got ${partFiles.length}`,
    );
  }

  // 최종 위치 준비
  const absTargetDir = resolveSafePath(meta.targetPath);
  await fs.mkdir(absTargetDir, { recursive: true });
  const safeName = meta.filename.replace(/[/\\:*?"<>|]/g, "_");
  const conflictMode: ConflictMode = meta.conflictMode ?? "autonumber";

  const finalAbs = await (async () => {
    const candidate = path.join(absTargetDir, safeName);
    let exists = true;
    try {
      await fs.access(candidate);
    } catch {
      exists = false;
    }
    if (!exists) return candidate;

    if (conflictMode === "overwrite") {
      // 그대로 덮어씀 (기존 파일은 writeStream 이 truncate)
      return candidate;
    }
    if (conflictMode === "skip") {
      // 사용자가 명시적으로 건너뛰기 선택 — sentinel string 으로 finalize 호출자에게 시그널
      throw new Error("__SKIP_CONFLICT__");
    }
    // autonumber (기본)
    const ext = path.extname(candidate);
    const base = candidate.slice(0, -ext.length);
    for (let i = 1; i < 1000; i++) {
      const c = `${base} (${i})${ext}`;
      try {
        await fs.access(c);
      } catch {
        return c;
      }
    }
    throw new Error("too many duplicates");
  })();

  // 스트림으로 순차 append (메모리 안정)
  const { createReadStream: crs, createWriteStream: cws } = await import("node:fs");
  const writeStream = cws(finalAbs);
  // 청크 N개 루프 돌며 pipeline/pipe 호출 시 writeStream 에 리스너가 누적됨.
  // 기본 한계 10 이라 50MB * 11청크 넘어가면 MaxListenersExceededWarning 발생.
  // 업로드 완료 이후 즉시 종료되는 stream 이라 안전하게 풀어도 됨.
  writeStream.setMaxListeners(Infinity);
  try {
    for (const part of partFiles) {
      await new Promise<void>((resolve, reject) => {
        const reader = crs(path.join(tempDir, part));
        reader.once("error", reject);
        reader.once("end", resolve);
        reader.pipe(writeStream, { end: false });
      });
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.once("error", reject);
      writeStream.end(() => resolve());
    });
  } catch (e) {
    writeStream.destroy();
    await fs.rm(finalAbs, { force: true });
    throw e;
  }

  const stat = await fs.stat(finalAbs);
  if (stat.size !== meta.totalSize) {
    await fs.rm(finalAbs, { force: true });
    throw new Error(`size mismatch: expected ${meta.totalSize}, got ${stat.size}`);
  }

  // 임시 정리
  await fs.rm(tempDir, { recursive: true, force: true });

  const finalName = path.basename(finalAbs);
  const relPath = path.posix.join(
    meta.targetPath.startsWith("/") ? meta.targetPath : "/" + meta.targetPath,
    finalName,
  );
  return {
    name: finalName,
    path: relPath,
    isFolder: false,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    kind: detectKindExport(finalName, false),
  };
}

export async function abortChunkUpload(fileId: string): Promise<void> {
  const dir = getUploadTempDir(fileId);
  await fs.rm(dir, { recursive: true, force: true });
}

// detectKind는 파일 내부 함수라 export 버전 추가
export function detectKindExport(name: string, isFolder: boolean): FileEntry["kind"] {
  return detectKind(name, isFolder);
}
