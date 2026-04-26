import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, clientVideos } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

function makeSlug(name: string): string {
  // 한글 그대로 + 영문 소문자 + 숫자 + 하이픈
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣\-]/g, "")
    .slice(0, 60);
}

// GET /api/clients → 목록 (admin/member)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }

  // 클라당 영상 수 집계
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      contactEmail: clients.contactEmail,
      notes: clients.notes,
      active: clients.active,
      createdAt: clients.createdAt,
      videoCount: sql<number>`(SELECT COUNT(*) FROM ${clientVideos} WHERE ${clientVideos.clientId} = ${clients.id})`,
    })
    .from(clients)
    .orderBy(desc(clients.createdAt));

  return NextResponse.json({
    clients: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
      videoCount: Number(r.videoCount) || 0,
    })),
  });
}

// POST /api/clients body: { name, contactEmail?, notes? } → 생성
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const contactEmail =
    typeof body?.contactEmail === "string" ? body.contactEmail.trim() : null;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  const baseSlug = makeSlug(name) || "client";
  // 고유 slug 보장
  let slug = baseSlug;
  for (let i = 1; i < 1000; i++) {
    const existing = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    slug = `${baseSlug}-${i}`;
  }

  const id = randomUUID();
  await db.insert(clients).values({
    id,
    name,
    slug,
    contactEmail: contactEmail || null,
    notes: notes || null,
    active: true,
    createdBy: session.sub,
  });
  return NextResponse.json({ ok: true, id, slug });
}

export const runtime = "nodejs";
