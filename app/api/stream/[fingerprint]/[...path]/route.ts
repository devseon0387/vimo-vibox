import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hlsAssets, shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { getHLSDir } from "@/lib/fs/hls";
import { resolveAllowedPaths } from "@/lib/share/paths";
import { logTraffic } from "@/lib/traffic";

/**
 * HLS 스트리밍 엔드포인트.
 *
 * URL: /api/stream/{fingerprint}/{playlist.m3u8|segment_NNN.ts}
 *
 * 인증:
 *  - 로그인 유저: canAccessFile 체크 (rendering/library/personal zone)
 *  - 공유 링크 게스트: ?token=XXX 으로 share_links 검증
 *
 * 캐시:
 *  - 매니페스트 (.m3u8): public, max-age=300 (5분, 짧게)
 *  - 세그먼트 (.ts): public, max-age=2592000, immutable (30일)
 *  - fingerprint 가 콘텐츠 해시라 immutable 안전
 *
 * CF Cache Rule: /api/stream/* 패턴으로 Cache Everything (30일)
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ fingerprint: string; path: string[] }> },
) {
  const { fingerprint, path: parts } = await ctx.params;
  if (!/^[a-f0-9]{16}$/.test(fingerprint)) {
    return new Response("invalid fingerprint", { status: 400 });
  }
  if (!parts || parts.length === 0) {
    return new Response("path required", { status: 400 });
  }
  const subPath = parts.join("/");
  // 안전: 단일 세그먼트 또는 매니페스트만 허용
  if (!/^(playlist\.m3u8|segment_\d{3}\.ts)$/.test(subPath)) {
    return new Response("invalid path", { status: 400 });
  }

  // hls_assets 에서 원본 파일 경로 조회
  const [asset] = await db
    .select()
    .from(hlsAssets)
    .where(eq(hlsAssets.fingerprint, fingerprint))
    .limit(1);
  if (!asset) {
    return new Response("not found", { status: 404 });
  }

  // 인증: 세션 OR 공유 토큰 둘 중 하나
  const url = new URL(req.url);
  const shareToken = url.searchParams.get("token");
  let authorized = false;

  if (shareToken) {
    // 공유 링크 검증
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, shareToken))
      .limit(1);
    if (link) {
      const expired = link.expiresAt && link.expiresAt.getTime() < Date.now();
      if (!expired) {
        const allowedPaths = resolveAllowedPaths(link);
        if (allowedPaths.includes(asset.filePath)) {
          authorized = true;
        }
      }
    }
  } else {
    // 일반 로그인 유저
    const session = await getCurrentSession();
    if (session && (await canAccessFile(session, asset.filePath))) {
      authorized = true;
    }
  }

  if (!authorized) {
    return new Response("unauthorized", { status: 401 });
  }

  const filePath = path.join(getHLSDir(fingerprint), subPath);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response("file missing", { status: 404 });
  }

  const isManifest = subPath.endsWith(".m3u8");
  const contentType = isManifest
    ? "application/vnd.apple.mpegurl"
    : "video/mp2t";
  // 매니페스트는 짧게, 세그먼트는 영구 (fingerprint 보장)
  const cacheControl = isManifest
    ? "public, max-age=300"
    : "public, max-age=2592000, immutable";
  const etag = `"${fingerprint}-${subPath}"`;

  // ETag 일치 시 304
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": cacheControl,
        Vary: "Accept-Encoding",
      },
    });
  }

  // 트래픽 로그 (세그먼트만, 매니페스트는 너무 작음)
  if (!isManifest && stat.size >= 5 * 1024 * 1024) {
    logTraffic({
      path: asset.filePath,
      bytes: stat.size,
      source: "share",
      shareToken: shareToken ?? null,
    });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  // Vary 를 Accept-Encoding 만으로 고정 — Next 가 기본 추가하는
  // rsc/next-router-* 가 CF 캐시 키를 분산시키는 것 차단
  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": cacheControl,
      ETag: etag,
      Vary: "Accept-Encoding",
    },
  });
}

export const runtime = "nodejs";
