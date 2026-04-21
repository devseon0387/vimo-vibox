import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import type { Category, Kind } from "@/lib/comments/detect";

const VALID_CATEGORIES: Category[] = ["txt", "cut", "col", "aud", "mtn", "etc"];
const VALID_KINDS: Kind[] = ["feedback", "praise"];

// PATCH /api/comments/[id]
// body: { category?, body?, resolved?: boolean }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const patch: Partial<typeof comments.$inferInsert> = {};

  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    patch.category = body.category;
  }

  if (body.kind !== undefined) {
    if (!VALID_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    patch.kind = body.kind;
  }

  if (typeof body.body === "string") {
    // 본문 편집은 작성자만
    if (existing.authorId !== session.sub) {
      return NextResponse.json({ error: "작성자만 편집할 수 있어요" }, { status: 403 });
    }
    const text = body.body.trim();
    if (text.length === 0 || text.length > 2000) {
      return NextResponse.json({ error: "invalid body length" }, { status: 400 });
    }
    patch.body = text;
  }

  if (typeof body.resolved === "boolean") {
    if (body.resolved) {
      patch.resolvedAt = new Date();
      patch.resolvedBy = session.sub;
    } else {
      patch.resolvedAt = null;
      patch.resolvedBy = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });
  }

  await db.update(comments).set(patch).where(eq(comments.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/comments/[id] — 작성자 또는 관리자만
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.authorId !== session.sub && session.role !== "admin") {
    return NextResponse.json({ error: "작성자 또는 관리자만 삭제할 수 있어요" }, { status: 403 });
  }

  // 답글도 같이 삭제
  await db
    .delete(comments)
    .where(and(eq(comments.parentId, id)));
  await db.delete(comments).where(eq(comments.id, id));

  return NextResponse.json({ ok: true });
}
