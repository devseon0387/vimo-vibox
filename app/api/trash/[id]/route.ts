import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { restoreFromTrash, permanentDelete } from "@/lib/fs/trash";
import { db } from "@/lib/db/client";
import { trashItems } from "@/lib/db/schema";

async function authorizeTrashAccess(
  trashId: string,
  session: { sub: string; role: string } | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!session) return { ok: false, status: 401, error: "unauthorized" };
  const [row] = await db
    .select({ deletedBy: trashItems.deletedBy })
    .from(trashItems)
    .where(eq(trashItems.id, trashId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "not found" };
  if (session.role === "admin") return { ok: true };
  if (row.deletedBy === session.sub) return { ok: true };
  return { ok: false, status: 403, error: "forbidden" };
}

// POST /api/trash/[id] → 복원
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  const { id } = await ctx.params;
  const auth = await authorizeTrashAccess(id, session);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const restoredPath = await restoreFromTrash(id);
    return NextResponse.json({ ok: true, path: restoredPath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/trash/[id] → 영구 삭제
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  const { id } = await ctx.params;
  const auth = await authorizeTrashAccess(id, session);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    await permanentDelete(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
