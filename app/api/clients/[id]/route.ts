import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// GET /api/clients/[id] → 단일 클라
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    client: { ...row, createdAt: row.createdAt.getTime() },
  });
}

// PATCH /api/clients/[id] body: { name?, contactEmail?, notes?, active? }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const update: Partial<typeof clients.$inferInsert> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.contactEmail === "string")
    update.contactEmail = body.contactEmail.trim() || null;
  if (typeof body.notes === "string") update.notes = body.notes.trim() || null;
  if (typeof body.active === "boolean") update.active = body.active;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }
  await db.update(clients).set(update).where(eq(clients.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/clients/[id] → 삭제 (cascade로 client_videos·tokens 같이)
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await db.delete(clients).where(eq(clients.id, id));
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
