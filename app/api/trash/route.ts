import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listTrash, emptyAllTrash } from "@/lib/fs/trash";

// GET /api/trash → 휴지통 항목 전체 (팀 공유 — 누가 지웠든 다 보임)
// 자동 만료는 GET에서 destructive 작업하면 race + 의도치 않은 삭제 위험이라
// 별도 launchd 잡(scripts/vibox-trash-expire.sh)으로 분리.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
