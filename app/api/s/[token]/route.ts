import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { resolveSafePath, statPath } from "@/lib/fs/storage";
import { streamWithTrafficLog } from "@/lib/traffic";
import { resolveAllowedPaths } from "@/lib/share/paths";
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

  // 멀티 파일 지원: ?p=/foo.mp4 로 특정 파일 선택 가능
  const requestedPath = url.searchParams.get("p");
  const allowedPaths = resolveAllowedPaths(link);
  const targetPath = requestedPath && allowedPaths.includes(requestedPath)
    ? requestedPath
    : link.filePath;

  // 다운로드 요청인데 다운로드 금지된 경우 차단
  const isDownload = url.searchParams.get("download") === "1";
  if (isDownload && !link.allowDownload) {
    return new Response("download not allowed", { status: 403 });
  }

  let abs: string;
  let size: number;
  let etag: string;
  try {
    const { abs: _abs, stat } = await statPath(targetPath);
    if (stat.isDirectory()) return new Response("invalid", { status: 400 });
    resolveSafePath(targetPath);
    abs = _abs;
    size = stat.size;
    etag = `"${size}-${Math.floor(stat.mtimeMs)}"`;
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
  const disposition = isDownload ? "attachment" : "inline";
  const cacheControl = "private, max-age=3600";

  const range = req.headers.get("range");

  // 조건부 요청: Range 없는 재요청은 304로 응답 (브라우저 캐시 재사용)
  if (!range) {
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
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
      const ns = fs.createReadStream(abs, { start, end, highWaterMark: 16 << 20 });
      const webStream = streamWithTrafficLog(ns, {
        path: targetPath,
        source: "share",
        shareToken: token,
      });
      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
          ETag: etag,
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  const ns = fs.createReadStream(abs, { highWaterMark: 16 << 20 });
  const webStream = streamWithTrafficLog(ns, {
    path: targetPath,
    source: "share",
    shareToken: token,
  });
  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      ETag: etag,
      "Cache-Control": cacheControl,
    },
  });
}

// HEAD: 메타데이터만. 공유 링크 유효성·비밀번호 검증에 사용 (클라이언트 폼용)
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const password = url.searchParams.get("password") ?? "";

  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const link = rows[0];
  if (!link) return new Response(null, { status: 404 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return new Response(null, { status: 410 });
  }
  if (link.passwordHash) {
    if (!password) return new Response(null, { status: 401 });
    const ok = await bcrypt.compare(password, link.passwordHash);
    if (!ok) return new Response(null, { status: 401 });
  }
  return new Response(null, { status: 200 });
}

export const runtime = "nodejs";
