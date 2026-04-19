import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// DELETE /api/shares/[id]  → 내 공유 링크 삭제 (취소)
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.createdBy, session.sub)));

  return NextResponse.json({ ok: true });
}
