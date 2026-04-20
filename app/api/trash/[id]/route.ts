import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { restoreFromTrash, permanentDelete } from "@/lib/fs/trash";

// POST /api/trash/[id] → 복원
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
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
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    await permanentDelete(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
