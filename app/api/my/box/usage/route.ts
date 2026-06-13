import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getPersonalUsage } from "@/lib/fs/usage";

// GET /api/my/box/usage
// 본인 개인 드라이브 사용량 + 쿼타 반환 (사이드바·대시보드용).
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getPersonalUsage(session.sub));
}

export const runtime = "nodejs";
