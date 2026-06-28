import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { r2Cache } from "@/lib/db/schema";
import { r2Enabled } from "@/lib/r2";
import { uncache } from "@/lib/r2-replicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP_BYTES = 10_000_000_000; // R2 무료티어 10GB (표시 기준)

// GET /api/admin/r2 — 현재 R2 캐시 목록 + 사용량. 관리자 전용.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db.select().from(r2Cache).orderBy(desc(r2Cache.cachedAt));
  const items = rows.map((r) => ({
    path: r.path,
    name: r.path.split("/").pop() ?? r.path,
    bytes: Number(r.bytes),
    cachedAt: r.cachedAt.getTime(),
  }));
  const total = items.reduce((s, i) => s + i.bytes, 0);
  return NextResponse.json({
    enabled: r2Enabled(),
    items,
    total,
    count: items.length,
    capBytes: CAP_BYTES,
  });
}

// DELETE /api/admin/r2  body: { path } | { all: true } — R2 객체 + r2_cache 행 함께 제거(uncache).
// 정본은 항상 M2 라 내려도 다운로드는 M2 로 폴백(느려질 뿐, 파일 안 사라짐).
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.all === true) {
    const rows = await db.select().from(r2Cache);
    for (const r of rows) await uncache(r.path);
    return NextResponse.json({ ok: true, deleted: rows.length });
  }
  const path = typeof body?.path === "string" ? body.path : null;
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
  await uncache(path);
  return NextResponse.json({ ok: true });
}
