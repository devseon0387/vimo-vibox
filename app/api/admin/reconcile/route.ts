import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { runReconcile } from "@/lib/reconcile";

// POST /api/admin/reconcile  body: { apply?: boolean }
// 관리자 전용. apply=false (기본)이면 드라이런, true면 실제 삭제 수행.
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const apply = body?.apply === true;

  try {
    const report = await runReconcile({ apply });
    return NextResponse.json({ ok: true, report });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
