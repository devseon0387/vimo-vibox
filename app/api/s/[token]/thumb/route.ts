import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { resolveAllowedPaths } from "@/lib/share/paths";
import {
  getFrameThumbPath,
  getThumbPath,
  generateFrameThumb,
  generateThumb,
  hasFrameThumb,
  hasThumb,
  isVideoPath,
} from "@/lib/fs/thumbnail";

// GET /api/s/[token]/thumb?p=/foo.mp4[&t=12][&password=xxx]
// 공유 링크 내 파일의 썸네일 (메인 or 프레임 시점)
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const p = url.searchParams.get("p");
  const password = url.searchParams.get("password") ?? "";
  const tParam = url.searchParams.get("t");

  if (!p) return new Response("p required", { status: 400 });
  if (!isVideoPath(p)) return new Response("not a video", { status: 400 });

  // 공유 링크 검증
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
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

  // 공유 링크에 포함된 파일인지 확인
  const allowedPaths = resolveAllowedPaths(link);
  if (!allowedPaths.includes(p)) {
    return new Response("not allowed", { status: 403 });
  }

  let abs: string;
  if (tParam !== null) {
    const seconds = parseFloat(tParam);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return new Response("invalid t", { status: 400 });
    }
    let exists = await hasFrameThumb(p, seconds);
    if (!exists) exists = await generateFrameThumb(p, seconds);
    if (!exists) return new Response("not available", { status: 404 });
    abs = getFrameThumbPath(p, seconds);
  } else {
    let exists = await hasThumb(p);
    if (!exists) exists = await generateThumb(p);
    if (!exists) return new Response("not available", { status: 404 });
    abs = getThumbPath(p);
  }

  const stat = await fs.stat(abs);
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const cacheControl = "public, max-age=604800";

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": cacheControl },
    });
  }

  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": cacheControl,
      ETag: etag,
    },
  });
}

export const runtime = "nodejs";
