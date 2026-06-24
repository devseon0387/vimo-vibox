import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hlsAssets, encodingJobs, shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { isPathInShare } from "@/lib/share/paths";

/**
 * GET /api/stream/lookup?path=/foo.mp4[&token=...]
 * → { ready: boolean, fingerprint?, manifestUrl?, status?, progress? }
 *
 * 클라이언트가 영상 재생 직전 호출.
 *  - HLS 준비됐으면 manifestUrl 받아서 hls.js 로 재생
 *  - 인코딩 중이면 progress 만 받고 원본 fallback
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  const token = url.searchParams.get("token");

  if (!rawPath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  // macOS NFD/NFC 혼용 문제로 enqueue·hls_assets 키 일치 안 되는 케이스 차단
  const filePath = rawPath.normalize("NFC");

  // 인증
  let authorized = false;
  if (token) {
    const [link] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);
    if (link) {
      const expired = link.expiresAt && link.expiresAt.getTime() < Date.now();
      if (!expired) {
        // NFC 정규화 매칭(isPathInShare) — 한글 파일명 HLS lookup 이 거짓 미인증 되던 문제 차단
        if (isPathInShare(link, filePath)) authorized = true;
      }
    }
  } else {
    const session = await getCurrentSession();
    if (session && (await canAccessFile(session, filePath))) {
      authorized = true;
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 자산 조회
  const [asset] = await db
    .select()
    .from(hlsAssets)
    .where(eq(hlsAssets.filePath, filePath))
    .limit(1);

  if (asset) {
    const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";
    return NextResponse.json({
      ready: true,
      fingerprint: asset.fingerprint,
      manifestUrl: `/api/stream/${asset.fingerprint}/playlist.m3u8${tokenSuffix}`,
      durationSec: asset.durationSec,
    });
  }

  // 인코딩 큐 상태 조회
  const [job] = await db
    .select()
    .from(encodingJobs)
    .where(eq(encodingJobs.filePath, filePath))
    .orderBy(encodingJobs.enqueuedAt)
    .limit(1);

  if (job) {
    return NextResponse.json({
      ready: false,
      status: job.status,
      progress: job.progress,
    });
  }

  return NextResponse.json({ ready: false, status: "not_queued" });
}

export const runtime = "nodejs";
