import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { comments, shareLinks } from "@/lib/db/schema";

// 공유 링크 검증 helper
async function verifyShare(
  token: string,
  password: string,
): Promise<
  | { ok: true; link: typeof shareLinks.$inferSelect; allowedPaths: string[] }
  | { ok: false; status: number; error: string }
> {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  if (!link) return { ok: false, status: 404, error: "not found" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410, error: "expired" };
  }
  if (link.passwordHash) {
    if (!password) return { ok: false, status: 401, error: "password required" };
    const m = await bcrypt.compare(password, link.passwordHash);
    if (!m) return { ok: false, status: 401, error: "wrong password" };
  }
  const allowedPaths: string[] = link.paths
    ? (JSON.parse(link.paths) as string[])
    : [link.filePath];
  return { ok: true, link, allowedPaths };
}

// GET /api/s/[token]/comments?p=/foo.mp4&password=...
// → 해당 파일의 게스트 가능 댓글 목록
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const p = url.searchParams.get("p");
  const password = url.searchParams.get("password") ?? "";

  const check = await verifyShare(token, password);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { link, allowedPaths } = check;
  const filePath = p && allowedPaths.includes(p) ? p : link.filePath;

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.filePath, filePath))
    .orderBy(asc(comments.videoTimeMs), asc(comments.createdAt));

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      videoTimeMs: r.videoTimeMs,
      body: r.body,
      guestName: r.guestName,
      authorName: r.authorName,
      createdAt: r.createdAt.getTime(),
    })),
  });
}

// POST /api/s/[token]/comments
// body: { path?, videoTimeMs?, body, guestName, password? }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.body || !body?.guestName) {
    return NextResponse.json({ error: "body, guestName required" }, { status: 400 });
  }

  const check = await verifyShare(token, String(body.password ?? ""));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { link, allowedPaths } = check;
  if (!link.allowComments) {
    return NextResponse.json({ error: "comments not allowed" }, { status: 403 });
  }

  const filePath =
    body.path && allowedPaths.includes(String(body.path))
      ? String(body.path)
      : link.filePath;

  const videoTimeMs =
    typeof body.videoTimeMs === "number" && body.videoTimeMs >= 0
      ? Math.floor(body.videoTimeMs)
      : 0;

  const guestName = String(body.guestName).trim().slice(0, 60);
  const text = String(body.body).trim().slice(0, 2000);
  if (!guestName || !text) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await db.insert(comments).values({
    id: randomUUID(),
    filePath,
    authorId: "guest", // 게스트 시스템 유저
    authorName: guestName,
    guestName,
    shareToken: token,
    videoTimeMs,
    category: "etc",
    autoCategory: "etc",
    kind: "feedback",
    autoKind: "feedback",
    body: text,
  });

  return NextResponse.json({ ok: true });
}
