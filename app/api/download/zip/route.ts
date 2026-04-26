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
 * 폴더를 ZIP 으로 스트리밍 다운로드.
 *  - archiver 로 메모리 안 먹고 청크 스트리밍
 *  - canAccessFile 권한 통과한 파일만 포함 (파트너는 본인 업로드만)
 *  - .vibox/ .DS_Store / ._* 자동 제외
 *  - Content-Length 미리 계산 안 함 (chunked transfer)
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const rel = req.nextUrl.searchParams.get("path");
  if (!rel) return new Response("path required", { status: 400 });

  if (!(await canAccessFile(session, rel))) {
    return new Response("forbidden", { status: 403 });
  }

  let absDir: string;
  try {
    absDir = resolveSafePath(rel);
    const stat = await fsp.stat(absDir);
    if (!stat.isDirectory()) {
      return new Response("not a directory", { status: 400 });
    }
  } catch {
    return new Response("not found", { status: 404 });
  }

  const folderName = path.basename(absDir) || "vibox";
  const today = new Date().toISOString().slice(0, 10);
  const zipName = `${folderName}-${today}.zip`;
  const encodedName = encodeURIComponent(zipName);

  const archive = archiver("zip", {
    zlib: { level: 1 }, // 영상이 대부분이라 압축 효과 거의 없음 → 속도 우선
  });

  let totalBytes = 0;
  archive.on("data", (chunk: Buffer) => {
    totalBytes += chunk.length;
  });

  // 파일 단위로 권한 체크하면서 추가
  await addDirToArchive(archive, absDir, "", session, rel);
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

  // 응답 후 트래픽 로그 (정확한 크기 모르므로 archive 종료 시 기록)
  archive.on("end", () => {
    if (totalBytes > 0) {
      logTraffic({
        path: rel,
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
