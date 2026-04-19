import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveSafePath, statPath } from "@/lib/fs/storage";
import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import mime from "./mime";

// GET /api/download?path=/foo/bar.mp4[&inline=1]
// Range 헤더 지원 (비디오 스트리밍용)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const rel = req.nextUrl.searchParams.get("path");
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  if (!rel) return new Response("path required", { status: 400 });

  let abs: string;
  let size: number;
  try {
    const { abs: _abs, stat } = await statPath(rel);
    if (stat.isDirectory()) return new Response("is a directory", { status: 400 });
    resolveSafePath(rel);
    abs = _abs;
    size = stat.size;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(msg, { status: 400 });
  }

  const filename = path.basename(abs);
  const encodedName = encodeURIComponent(filename);
  const contentType = mime(filename);
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`;

  const range = req.headers.get("range");
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
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
        },
      });
    }
  }

  const nodeStream = fs.createReadStream(abs, { highWaterMark: 16 << 20 });
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
    },
  });
}

export const runtime = "nodejs";
