import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { clientVideos, shareLinks, shareViews } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "vibox_visitor";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1년
const RATE_LIMIT_MS = 4000; // 같은 visitor+path는 4초당 최대 1회 (악의적 inflate 방지)

type Body = {
  filePath?: string;
  positionSec?: number;
  durationSec?: number | null;
  watchedDeltaSec?: number; // 마지막 ping 이후 실제 재생된 초
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const link = await db
    .select({
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      paths: shareLinks.paths,
      filePath: shareLinks.filePath,
    })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  if (link.length === 0) return NextResponse.json({ ok: false }, { status: 404 });
  const { expiresAt, revokedAt, paths: linkPathsJson, filePath: linkPrimaryPath } = link[0];
  if (revokedAt) return NextResponse.json({ ok: false }, { status: 410 });
  if (expiresAt && expiresAt < new Date()) return NextResponse.json({ ok: false }, { status: 410 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const filePath = (body.filePath ?? "").trim();
  if (!filePath) return NextResponse.json({ ok: false }, { status: 400 });

  // P1: filePath 화이트리스트 검증 — 토큰이 노출한 paths 안에 있어야 통계 오염 방지
  const allowed = new Set<string>();
  allowed.add(linkPrimaryPath);
  if (linkPathsJson) {
    try {
      const arr = JSON.parse(linkPathsJson) as unknown;
      if (Array.isArray(arr)) for (const p of arr) if (typeof p === "string") allowed.add(p);
    } catch {
      /* invalid JSON — primary만 허용 */
    }
  }
  if (!allowed.has(filePath)) {
    return NextResponse.json({ ok: false, error: "path not in share" }, { status: 400 });
  }

  // visitor cookie (anonymous tracking)
  const cookieStore = await cookies();
  let visitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    cookieStore.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: VISITOR_MAX_AGE,
      path: "/",
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;

  const now = new Date();
  const positionSec = Math.max(0, Number(body.positionSec) || 0);
  const watchedDeltaSec = Math.max(0, Math.min(60, Number(body.watchedDeltaSec) || 0));
  const durationSec = body.durationSec != null ? Math.max(0, Number(body.durationSec)) : null;

  // Rate limit: 기존 row의 마지막 이벤트 시각과 비교
  const existing = await db
    .select({ id: shareViews.id, lastEventAt: shareViews.lastEventAt })
    .from(shareViews)
    .where(
      and(
        eq(shareViews.shareToken, token),
        eq(shareViews.visitorId, visitorId),
        eq(shareViews.filePath, filePath),
      ),
    )
    .limit(1);
  if (
    existing.length > 0 &&
    now.getTime() - existing[0].lastEventAt.getTime() < RATE_LIMIT_MS
  ) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  // Phase 1 per-client 컨텍스트 (best-effort, nullable). 파일이 정확히 한 클라에만
  // 등록돼 있으면 그 클라로 귀속. 시청기록 격리는 이미 share_token 단위라 NULL 이어도 안전.
  let ctxClientId: string | null = null;
  let ctxShareClientId: string | null = null;
  try {
    const cvs = await db
      .select({ id: clientVideos.id, clientId: clientVideos.clientId })
      .from(clientVideos)
      .where(eq(clientVideos.filePath, filePath))
      .limit(2);
    if (cvs.length === 1) {
      ctxClientId = cvs[0].clientId;
      ctxShareClientId = cvs[0].id;
    }
  } catch {
    /* NULL 유지 */
  }

  // Atomic upsert via UNIQUE INDEX (token, visitor, file_path) — race-safe
  await db
    .insert(shareViews)
    .values({
      id: randomUUID(),
      shareToken: token,
      filePath,
      visitorId,
      ip,
      userAgent: ua,
      openedAt: now,
      lastEventAt: now,
      maxPositionSec: positionSec,
      totalWatchSec: watchedDeltaSec,
      durationSec,
      completed: durationSec ? positionSec >= durationSec * 0.95 : false,
      clientId: ctxClientId,
      shareClientId: ctxShareClientId,
    })
    .onConflictDoUpdate({
      target: [shareViews.shareToken, shareViews.visitorId, shareViews.filePath],
      set: {
        lastEventAt: now,
        maxPositionSec: sql`GREATEST(${shareViews.maxPositionSec}, ${positionSec})`,
        totalWatchSec: sql`${shareViews.totalWatchSec} + ${watchedDeltaSec}`,
        durationSec: durationSec ?? sql`${shareViews.durationSec}`,
        completed: sql`CASE
          WHEN COALESCE(${durationSec ?? null}, ${shareViews.durationSec}) IS NOT NULL
            AND GREATEST(${shareViews.maxPositionSec}, ${positionSec}) >= COALESCE(${durationSec ?? null}, ${shareViews.durationSec}) * 0.95
          THEN true
          ELSE ${shareViews.completed}
        END`,
      },
    });

  return NextResponse.json({ ok: true });
}
