import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listTrash, emptyAllTrash, autoExpireOldTrash } from "@/lib/fs/trash";

// GET /api/trash → 휴지통 항목 전체 (팀 공유 — 누가 지웠든 다 보임)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await autoExpireOldTrash(30).catch(() => {});

  const items = await listTrash();
  return NextResponse.json({ items });
}

// DELETE /api/trash → 휴지통 전체 비우기 (관리자만)
export async function DELETE() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const count = await emptyAllTrash();
  return NextResponse.json({ ok: true, count });
}
