/**
 * GET /api/health/deps — 의존성 헬스 체크 (admin only).
 * ffmpeg/claude/ocr 같은 binary + 필수 env 가 살아있는지 운영 모니터링용.
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { runDepsCheck } from "@/lib/deps-health";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin")
    return NextResponse.json({ error: "admin only" }, { status: 403 });

  const result = await runDepsCheck();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export const runtime = "nodejs";
