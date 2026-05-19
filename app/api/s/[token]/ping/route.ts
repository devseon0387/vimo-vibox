import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { shareLinks, shareViews } from "@/lib/db/schema";

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
    .select({ expiresAt: shareLinks.expiresAt })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  if (link.length === 0) return NextResponse.json({ ok: false }, { status: 404 });
  const { expiresAt } = link[0];
  if (expiresAt && expiresAt < new Date()) return NextResponse.json({ ok: false }, { status: 410 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const filePath = (body.filePath ?? "").trim();
  if (!filePath) return NextResponse.json({ ok: false }, { status: 400 });

  // visitor cookie (anonymous tracking)
  const cookieStore = await cookies();
  let visitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    cookieStore.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
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
    })
    .onConflictDoUpdate({
      target: [shareViews.shareToken, shareViews.visitorId, shareViews.filePath],
      set: {
        lastEventAt: now,
        maxPositionSec: sql`MAX(${shareViews.maxPositionSec}, ${positionSec})`,
        totalWatchSec: sql`${shareViews.totalWatchSec} + ${watchedDeltaSec}`,
        durationSec: durationSec ?? sql`${shareViews.durationSec}`,
        completed: sql`CASE
          WHEN COALESCE(${durationSec ?? null}, ${shareViews.durationSec}) IS NOT NULL
            AND MAX(${shareViews.maxPositionSec}, ${positionSec}) >= COALESCE(${durationSec ?? null}, ${shareViews.durationSec}) * 0.95
          THEN 1
          ELSE ${shareViews.completed}
        END`,
      },
    });

  return NextResponse.json({ ok: true });
}
