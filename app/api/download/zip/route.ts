import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import archiver from "archiver";
import { Readable } from "node:stream";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { resolveSafePath } from "@/lib/fs/storage";
import { logTraffic } from "@/lib/traffic";

/**
 * GET /api/download/zip?path=/folder
 *   또는 ?paths=/a,/b,/c.mp4  (여러 경로 — 다중 선택 일괄 다운로드용)
 * 폴더 하나 또는 임의 파일·폴더 묶음을 ZIP 으로 스트리밍 다운로드.
 *  - archiver 로 메모리 안 먹고 청크 스트리밍
 *  - canAccessFile 권한 통과한 파일만 포함 (파트너는 본인 업로드만)
 *  - .vibox/ .DS_Store / ._* 자동 제외
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const single = req.nextUrl.searchParams.get("path");
  const multi = req.nextUrl.searchParams.get("paths");
  const targets: string[] = multi
    ? multi
        .split(",")
        .map((s) => decodeURIComponent(s.trim()))
        .filter(Boolean)
    : single
      ? [single]
      : [];
  if (targets.length === 0) {
    return new Response("path or paths required", { status: 400 });
  }

  // 권한 검사 (모든 대상)
  for (const t of targets) {
    if (!(await canAccessFile(session, t))) {
      return new Response("forbidden", { status: 403 });
    }
  }

  // 묶음 이름 결정: 단일이면 폴더/파일명, 다중이면 "vibox-N개"
  const today = new Date().toISOString().slice(0, 10);
  let zipName: string;
  if (targets.length === 1) {
    const baseAbs = resolveSafePath(targets[0]);
    const baseName = path.basename(baseAbs) || "vibox";
    zipName = `${baseName}-${today}.zip`;
  } else {
    zipName = `vibox-${targets.length}items-${today}.zip`;
  }
  const encodedName = encodeURIComponent(zipName);

  const archive = archiver("zip", { zlib: { level: 1 } });

  let totalBytes = 0;
  archive.on("data", (chunk: Buffer) => {
    totalBytes += chunk.length;
  });

  // 각 대상이 파일이면 그대로, 폴더면 재귀 추가
  for (const t of targets) {
    let abs: string;
    try {
      abs = resolveSafePath(t);
    } catch {
      continue;
    }
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const folderName = path.basename(abs);
      await addDirToArchive(archive, abs, folderName, session, t);
    } else if (stat.isFile() && !shouldSkip(path.basename(abs))) {
      archive.file(abs, { name: path.basename(abs) });
    }
  }
  void archive.finalize();

  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as unknown as ReadableStream;

  const response = new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });

  archive.on("end", () => {
    if (totalBytes > 0) {
      logTraffic({
        path: targets.join(","),
        bytes: totalBytes,
        source: "download",
        shareToken: null,
      });
    }
  });

  return response;
}

async function addDirToArchive(
  archive: archiver.Archiver,
  absDir: string,
  zipPrefix: string,
  session: Awaited<ReturnType<typeof getCurrentSession>>,
  relRoot: string,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (shouldSkip(e.name)) continue;
    const abs = path.join(absDir, e.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      await addDirToArchive(archive, abs, zipPath, session, relRoot);
    } else if (e.isFile()) {
      // 파트너 권한: 파일 단위 다시 체크 (자기 업로드만)
      const relPath =
        relRoot.replace(/\/$/, "") +
        "/" +
        path.relative(resolveSafePath(relRoot), abs).split(path.sep).join("/");
      if (session && (await canAccessFile(session, relPath))) {
        archive.file(abs, { name: zipPath });
      }
    }
  }
}

function shouldSkip(name: string): boolean {
  if (name === ".vibox") return true;
  if (name === ".DS_Store") return true;
  if (name.startsWith("._")) return true;
  return false;
}

export const runtime = "nodejs";
