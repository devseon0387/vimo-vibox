import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { enqueue, getQueueSnapshot, getJobByPath } from "@/lib/encoding/queue";

// POST /api/admin/encode  body: { path: "/foo.mp4" }
// 기존 영상을 HLS 인코딩 큐에 수동 추가 (백필용)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const filePath = body?.path;
  if (!filePath || typeof filePath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const job = await enqueue(filePath);
  return NextResponse.json({ ok: true, job });
}

// GET /api/admin/encode?path=...  → 인코딩 상태 조회
// GET /api/admin/encode (no path) → 큐 전체 스냅샷
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const filePath = url.searchParams.get("path");
  if (filePath) {
    const job = await getJobByPath(filePath);
    return NextResponse.json({ job });
  }
  const snapshot = await getQueueSnapshot();
  return NextResponse.json(snapshot);
}

export const runtime = "nodejs";
