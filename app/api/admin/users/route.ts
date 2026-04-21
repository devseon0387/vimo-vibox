import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json({ error: "admin only" }, { status: 403 }),
    };
  }
  return { session };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      role: users.role,
      quotaGb: users.quotaGb,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return NextResponse.json({
    users: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.getTime(),
    })),
  });
}

// POST /api/admin/users — 사용자 추가
// body: { username, name?, email?, password, role?, quotaGb? }
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { error: "username and password required" },
      { status: 400 },
    );
  }

  const username = String(body.username).trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,30}$/.test(username)) {
    return NextResponse.json(
      { error: "username must be 2-30 chars (a-z, 0-9, _, -)" },
      { status: 400 },
    );
  }

  if (String(body.password).length < 6) {
    return NextResponse.json(
      { error: "password must be at least 6 chars" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "username already exists" }, { status: 409 });
  }

  const role = body.role === "admin" ? "admin" : "member";
  const quotaGb = Number.isFinite(body.quotaGb) ? Number(body.quotaGb) : 100;
  const passwordHash = await bcrypt.hash(String(body.password), 10);

  await db.insert(users).values({
    id: randomUUID(),
    username,
    name: body.name ? String(body.name).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    passwordHash,
    role,
    quotaGb,
  });

  return NextResponse.json({ ok: true });
}
