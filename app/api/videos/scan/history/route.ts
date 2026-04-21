import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { scanHistory } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// GET /api/videos/scan/history?path=/foo.mp4
// → 해당 파일의 가장 최근 완료된 검수 정보
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "path required" }, { status: 400 });

  const rows = await db
    .select()
    .from(scanHistory)
    .where(eq(scanHistory.filePath, filePath))
    .orderBy(desc(scanHistory.startedAt))
    .limit(5);

  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      startedBy: r.startedBy,
      startedByName: r.startedByName,
      startedAt: r.startedAt.getTime(),
      finishedAt: r.finishedAt ? r.finishedAt.getTime() : null,
      status: r.status,
      issuesFound: r.issuesFound,
    })),
  });
}
