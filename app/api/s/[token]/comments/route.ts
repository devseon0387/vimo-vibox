import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { comments, shareLinks } from "@/lib/db/schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveAllowedPaths } from "@/lib/share/paths";

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
  const allowedPaths = resolveAllowedPaths(link);
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

  // 클라이언트 뷰: visibility='client' (스태프가 공개로 전환한 것)
  //                 + 이 공유 링크로 남긴 게스트 댓글 (shareToken 매칭)
  // 순화본 대신 원문 body 사용 — 클라이언트는 본인이 쓴 글 그대로 보여야 함
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.filePath, filePath),
        or(
          eq(comments.visibility, "client"),
          and(
            eq(comments.authorId, "guest"),
            eq(comments.shareToken, token),
          ),
        ),
      ),
    )
    .orderBy(asc(comments.videoTimeMs), asc(comments.createdAt));

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      authorId: r.authorId,
      authorName: r.authorName,
      guestName: r.guestName,
      videoTimeMs: r.videoTimeMs,
      category: r.category,
      autoCategory: r.autoCategory,
      kind: r.kind,
      autoKind: r.autoKind,
      annotation: r.annotation,
      body: r.body, // 원문 사용 (순화본 노출 X)
      parentId: r.parentId,
      resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
      resolvedBy: r.resolvedBy,
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

  // 스팸 방어 — IP 기반 + 토큰 기반
  const ip = getClientIp(req);
  const ipLimit = rateLimit(`guestcomment:ip:${ip}`, {
    max: 20,
    windowMs: 60 * 1000,
  });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `너무 많은 요청. ${ipLimit.retryAfterSec}초 후 다시 시도` },
      { status: 429 },
    );
  }
  const tokenLimit = rateLimit(`guestcomment:token:${token}`, {
    max: 60,
    windowMs: 60 * 1000,
  });
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { error: `이 공유 링크에 너무 많은 댓글. ${tokenLimit.retryAfterSec}초 후 다시 시도` },
      { status: 429 },
    );
  }

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
    // 게스트 피드백은 매니저 승인 대기 + 클라이언트 본인 뷰에는 자동 공개
    // (shareToken 매칭으로 자기 것 보임)
    visibility: "internal",
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}
