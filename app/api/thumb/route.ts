import { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getThumbPath,
  hasThumb,
  isVideoPath,
  generateThumb,
  getFrameThumbPath,
  hasFrameThumb,
  generateFrameThumb,
} from "@/lib/fs/thumbnail";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const relativePath = req.nextUrl.searchParams.get("path");
  if (!relativePath) return new Response("path required", { status: 400 });
  if (!isVideoPath(relativePath)) {
    return new Response("not a video", { status: 400 });
  }

  // t 파라미터 있으면 프레임 시점별 썸네일
  const tParam = req.nextUrl.searchParams.get("t");
  let abs: string;
  if (tParam !== null) {
    const seconds = parseFloat(tParam);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return new Response("invalid t", { status: 400 });
    }
    let exists = await hasFrameThumb(relativePath, seconds);
    if (!exists) exists = await generateFrameThumb(relativePath, seconds);
    if (!exists) return new Response("not available", { status: 404 });
    abs = getFrameThumbPath(relativePath, seconds);
  } else {
    let exists = await hasThumb(relativePath);
    if (!exists) exists = await generateThumb(relativePath);
    if (!exists) return new Response("not available", { status: 404 });
    abs = getThumbPath(relativePath);
  }

  const stat = await fs.stat(abs);
  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=604800", // 7일
      ETag: `"${stat.size}-${stat.mtimeMs}"`,
    },
  });
}
