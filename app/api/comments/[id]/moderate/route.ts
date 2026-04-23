import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, commentModerations } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// 내부팀(admin/member)만 접근
async function requireStaff() {
  const session = await getCurrentSession();
  if (!session) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (session.role !== "admin" && session.role !== "member") {
    return { error: NextResponse.json({ error: "staff only" }, { status: 403 }) };
  }
  return { session };
}

// POST /api/comments/[id]/moderate
// body: { moderatedBody: string | null }   // null 이면 순화본 제거 (원문으로 되돌림)
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireStaff();
  if (error) return error;
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  let newModerated: string | null;
  if (body.moderatedBody === null) {
    newModerated = null;
  } else if (typeof body.moderatedBody === "string") {
    const text = body.moderatedBody.trim();
    if (text.length === 0 || text.length > 2000) {
      return NextResponse.json(
        { error: "invalid moderatedBody length" },
        { status: 400 },
      );
    }
    newModerated = text;
  } else {
    return NextResponse.json(
      { error: "moderatedBody must be string or null" },
      { status: 400 },
    );
  }

  // 변경 없으면 노옵
  if (newModerated === existing.moderatedBody) {
    return NextResponse.json({ ok: true, noop: true });
  }

  // 히스토리 저장
  await db.insert(commentModerations).values({
    id: randomUUID(),
    commentId: id,
    bodyBefore: existing.moderatedBody,
    bodyAfter: newModerated ?? "", // 제거 시에도 기록
    editedBy: session!.sub,
    editedByName: session!.name ?? session!.username,
  });

  await db
    .update(comments)
    .set({ moderatedBody: newModerated })
    .where(eq(comments.id, id));

  return NextResponse.json({ ok: true });
}

// GET /api/comments/[id]/moderate → 히스토리 (최신순)
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireStaff();
  if (error) return error;
  const { id } = await ctx.params;

  const rows = await db
    .select()
    .from(commentModerations)
    .where(eq(commentModerations.commentId, id))
    .orderBy(desc(commentModerations.editedAt));

  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      bodyBefore: r.bodyBefore,
      bodyAfter: r.bodyAfter,
      editedBy: r.editedBy,
      editedByName: r.editedByName,
      editedAt: r.editedAt.getTime(),
    })),
  });
}
