import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { pruneTrafficLog } from "@/lib/traffic";

// POST /api/admin/stats/prune?days=90
// traffic_log 에서 N일 이전 레코드 일괄 삭제.
// 기본 90일, 관리자만 호출. launchd 크론이 주기적으로 호출함.
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days =
    daysParam && Number.isFinite(parseInt(daysParam, 10))
      ? Math.max(7, Math.min(365, parseInt(daysParam, 10)))
      : 90;

  const deleted = await pruneTrafficLog(days);
  return NextResponse.json({ ok: true, deleted, keepDays: days });
}

export const runtime = "nodejs";
