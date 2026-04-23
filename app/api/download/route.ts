import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { resolveSafePath, statPath } from "@/lib/fs/storage";
import { streamWithTrafficLog } from "@/lib/traffic";
import path from "node:path";
import fs from "node:fs";
import mime from "./mime";

// GET /api/download?path=/foo/bar.mp4[&inline=1]
// Range 헤더 지원 (비디오 스트리밍용)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const rel = req.nextUrl.searchParams.get("path");
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  if (!rel) return new Response("path required", { status: 400 });

  // 파트너는 본인 업로드만
  if (!(await canAccessFile(session, rel))) {
    return new Response("forbidden", { status: 403 });
  }

  let abs: string;
  let size: number;
  let etag: string;
  try {
    const { abs: _abs, stat } = await statPath(rel);
    if (stat.isDirectory()) return new Response("is a directory", { status: 400 });
    resolveSafePath(rel);
    abs = _abs;
    size = stat.size;
    // size + mtime 조합 ETag: 파일 교체되면 자동 무효화
    etag = `"${size}-${Math.floor(stat.mtimeMs)}"`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(msg, { status: 400 });
  }

  const filename = path.basename(abs);
  const encodedName = encodeURIComponent(filename);
  const contentType = mime(filename);
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`;
  // 영상/원본 파일은 수명이 길고 교체는 ETag로 감지 → 1시간 정도 캐시
  const cacheControl = "private, max-age=3600";

  const range = req.headers.get("range");

  // 조건부 요청 처리: Range 없는 단순 재요청은 304로 응답 (브라우저 캐시 재사용)
  if (!range) {
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }
  }
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (start >= size || end >= size || start > end) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(abs, { start, end, highWaterMark: 16 << 20 });
      const webStream = streamWithTrafficLog(nodeStream, {
        path: rel,
        source: "download",
        userId: session.sub,
      });
      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  const nodeStream = fs.createReadStream(abs, { highWaterMark: 16 << 20 });
  const webStream = streamWithTrafficLog(nodeStream, {
    path: rel,
    source: "download",
    userId: session.sub,
  });
  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      ETag: etag,
      "Cache-Control": cacheControl,
    },
  });
}

export const runtime = "nodejs";
