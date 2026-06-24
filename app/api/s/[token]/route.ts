import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { resolveSafePath, statPath } from "@/lib/fs/storage";
import { streamWithTrafficLog } from "@/lib/traffic";
import { resolveAllowedPaths, isPathInShare, resolveRequestedPath } from "@/lib/share/paths";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import mime from "../../download/mime";

// timing 균일화용 더미 hash (bcrypt cost 10) — 토큰 missing / 비번 틀림 응답시간 평준화
const DUMMY_BCRYPT_HASH = "$2a$10$abcdefghijklmnopqrstuuV1cKQjZ7ZSf6N3D8XWvLpVqVqJxOAaW";

// GET /api/s/[token]?password=xxx  → 공개 다운로드 (인증 없음)
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const password = url.searchParams.get("password") ?? "";

  // IP 기반 rate limit: 토큰 brute force 방어
  const ip = getClientIp(req);
  const rl = rateLimit(`share:${ip}`, { max: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const link = rows[0];
  if (!link) {
    // timing 균일화 (enumeration 차단)
    await bcrypt.compare(password || "x", DUMMY_BCRYPT_HASH).catch(() => {});
    return new Response("not found", { status: 404 });
  }

  if (link.revokedAt) {
    return new Response("revoked", { status: 410 });
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return new Response("expired", { status: 410 });
  }
  if (link.passwordHash) {
    if (!password) return new Response("password required", { status: 401 });
    const ok = await bcrypt.compare(password, link.passwordHash);
    if (!ok) return new Response("wrong password", { status: 401 });
  } else {
    // 비번 없는 링크라도 timing 일정하게
    await bcrypt.compare(password || "x", DUMMY_BCRYPT_HASH).catch(() => {});
  }

  // 멀티 파일 / 폴더 공유: ?p=/foo.mp4 로 특정 파일 선택.
  // 폴더 공유는 공유 폴더 하위 경로만 허용(isPathInShare) — 경계 밖이면 거부.
  const requestedPath = url.searchParams.get("p");
  let targetPath: string;
  if (link.kind === "folder") {
    if (!requestedPath || !isPathInShare(link, requestedPath)) {
      return new Response("forbidden", { status: 403 });
    }
    targetPath = requestedPath;
  } else {
    const allowedPaths = resolveAllowedPaths(link);
    // NFC 정규화 매칭 — 한글 파일명에서 요청 파일이 빗나가 첫 파일로 폴백되던 문제 차단(코멘트 라우트와 동일)
    targetPath = resolveRequestedPath(allowedPaths, requestedPath, link.filePath);
  }

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

  // 다운로드 카운트 증가 — atomic SQL increment (read-modify-write race 방지)
  db
    .update(shareLinks)
    .set({ downloadCount: sql`${shareLinks.downloadCount} + 1` })
    .where(eq(shareLinks.id, link.id))
    .execute()
    .catch(() => {});

  const filename = path.basename(abs);
  const encodedName = encodeURIComponent(filename);
  const contentType = mime(filename);
  const disposition = isDownload ? "attachment" : "inline";
  // private 캐시 (브라우저만, CF 엣지는 안 함) — 리보크/만료 즉시 반영 위함.
  // 같은 브라우저 재시청 시 304 또는 disk cache 사용.
  const cacheControl = "private, max-age=300, must-revalidate";

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

  const ip = getClientIp(req);
  const rl = rateLimit(`share:${ip}`, { max: 60, windowMs: 60_000 });
  if (!rl.ok) return new Response(null, { status: 429 });

  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const link = rows[0];
  if (!link) {
    await bcrypt.compare(password || "x", DUMMY_BCRYPT_HASH).catch(() => {});
    return new Response(null, { status: 404 });
  }
  if (link.revokedAt) return new Response(null, { status: 410 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return new Response(null, { status: 410 });
  }
  if (link.passwordHash) {
    if (!password) return new Response(null, { status: 401 });
    const ok = await bcrypt.compare(password, link.passwordHash);
    if (!ok) return new Response(null, { status: 401 });
  } else {
    await bcrypt.compare(password || "x", DUMMY_BCRYPT_HASH).catch(() => {});
  }
  return new Response(null, { status: 200 });
}

export const runtime = "nodejs";
