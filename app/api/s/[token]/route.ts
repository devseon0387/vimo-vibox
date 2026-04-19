import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { resolveSafePath, statPath } from "@/lib/fs/storage";
import mime from "../../download/mime";

// GET /api/s/[token]?password=xxx  → 공개 다운로드 (인증 없음)
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const password = url.searchParams.get("password") ?? "";

  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const link = rows[0];
  if (!link) return new Response("not found", { status: 404 });

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return new Response("expired", { status: 410 });
  }
  if (link.passwordHash) {
    if (!password) return new Response("password required", { status: 401 });
    const ok = await bcrypt.compare(password, link.passwordHash);
    if (!ok) return new Response("wrong password", { status: 401 });
  }

  let abs: string;
  let size: number;
  try {
    const { abs: _abs, stat } = await statPath(link.filePath);
    if (stat.isDirectory()) return new Response("invalid", { status: 400 });
    resolveSafePath(link.filePath);
    abs = _abs;
    size = stat.size;
  } catch {
    return new Response("file missing", { status: 404 });
  }

  // 다운로드 카운트 증가 (에러 나도 파일은 제공)
  db
    .update(shareLinks)
    .set({ downloadCount: link.downloadCount + 1 })
    .where(eq(shareLinks.id, link.id))
    .run?.();

  const filename = path.basename(abs);
  const encodedName = encodeURIComponent(filename);
  const contentType = mime(filename);

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
      const ns = fs.createReadStream(abs, { start, end, highWaterMark: 16 << 20 });
      const webStream = Readable.toWeb(ns) as unknown as ReadableStream;
      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        },
      });
    }
  }

  const ns = fs.createReadStream(abs, { highWaterMark: 16 << 20 });
  const webStream = Readable.toWeb(ns) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
    },
  });
}

// HEAD: 메타데이터만
export async function HEAD(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const link = rows[0];
  if (!link) return new Response(null, { status: 404 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return new Response(null, { status: 410 });
  }
  return new Response(null, { status: 200 });
}

export const runtime = "nodejs";
