import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime: number | null;
};

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody | null = null;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const expiresAt = body.expirationTime ? new Date(body.expirationTime) : null;

  // upsert by endpoint (한 디바이스가 재구독해도 1행 유지)
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, body.endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: session.sub,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
        expiresAt,
        failureCount: 0,
        lastUsedAt: new Date(),
      })
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    return NextResponse.json({ ok: true, action: "updated" });
  }

  await db.insert(pushSubscriptions).values({
    id: randomUUID(),
    userId: session.sub,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: ua,
    expiresAt,
  });
  return NextResponse.json({ ok: true, action: "created" });
}
