import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { statPath } from "@/lib/fs/storage";

function generateToken() {
  return randomBytes(16).toString("base64url");
}

// GET /api/shares → 내가 만든 공유 링크 목록
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: shareLinks.id,
      token: shareLinks.token,
      filePath: shareLinks.filePath,
      expiresAt: shareLinks.expiresAt,
      hasPassword: shareLinks.passwordHash,
      downloadCount: shareLinks.downloadCount,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.createdBy, session.sub))
    .orderBy(desc(shareLinks.createdAt));

  return NextResponse.json({
    shares: rows.map((r) => ({
      ...r,
      hasPassword: !!r.hasPassword,
    })),
  });
}

// POST /api/shares  body: { path, expiresInDays?, password? }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  // 파일 존재 확인
  try {
    const { stat } = await statPath(body.path);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: "folder sharing not supported yet" }, { status: 400 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const token = generateToken();
  const passwordHash = body.password ? await bcrypt.hash(String(body.password), 10) : null;
  const expiresAt =
    typeof body.expiresInDays === "number" && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await db.insert(shareLinks).values({
    id: randomUUID(),
    token,
    filePath: String(body.path),
    createdBy: session.sub,
    expiresAt,
    passwordHash,
  });

  return NextResponse.json({ ok: true, token });
}
