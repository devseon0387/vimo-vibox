import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, clientVideos } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// GET /api/clients/[id]/videos → 그 클라의 영상 목록 (display_order ASC)
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(clientVideos)
    .where(eq(clientVideos.clientId, id))
    .orderBy(asc(clientVideos.displayOrder), asc(clientVideos.addedAt));
  return NextResponse.json({
    videos: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      addedAt: r.addedAt.getTime(),
      addedBy: r.addedBy,
      status: r.status,
      displayOrder: r.displayOrder,
    })),
  });
}

// POST /api/clients/[id]/videos body: { paths: string[], status? }
// → 한 클라에 영상 N개 추가 (이미 있으면 skip)
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  // 클라 존재 확인
  const [cl] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!cl) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }
  const status =
    typeof body?.status === "string" &&
    ["draft", "sent", "approved", "archived"].includes(body.status)
      ? body.status
      : "draft";

  // 이미 추가된 것 검사
  const existing = await db
    .select({ filePath: clientVideos.filePath })
    .from(clientVideos)
    .where(
      and(
        eq(clientVideos.clientId, id),
        inArray(clientVideos.filePath, paths),
      ),
    );
  const skip = new Set(existing.map((e) => e.filePath));
  const toAdd = paths.filter((p) => !skip.has(p));

  let added = 0;
  for (const p of toAdd) {
    // 동시요청 race 로 위 존재검사를 둘 다 통과해도 UNIQUE(client_id, file_path)가 중복을 흡수한다.
    // ⚠️ onConflict 의 'target' 은 PG에서 해당 컬럼들의 유니크 인덱스를 "요구"한다
    //    (idx_client_videos_unique — schema.ts + drizzle-pg/0001). 그 인덱스가 없으면 no-op 이 아니라
    //    42P10 으로 throw 하므로, 이 기능 배포 전 0001 마이그레이션이 대상 DB에 반드시 적용돼 있어야 한다.
    // returning() 으로 실제 삽입 여부를 확인 — 충돌로 스킵된 행은 added 카운트에 넣지 않는다.
    const ins = await db
      .insert(clientVideos)
      .values({
        id: randomUUID(),
        clientId: id,
        filePath: p,
        addedBy: session.sub,
        status: status as "draft" | "sent" | "approved" | "archived",
        displayOrder: 0,
      })
      .onConflictDoNothing({
        target: [clientVideos.clientId, clientVideos.filePath],
      })
      .returning({ id: clientVideos.id });
    if (ins.length > 0) added++;
  }
  return NextResponse.json({
    ok: true,
    added,
    skipped: skip.size,
  });
}

// DELETE /api/clients/[id]/videos body: { paths: string[] }
// → 한 클라에서 영상 N개 제거 (실제 파일은 그대로)
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }
  await db
    .delete(clientVideos)
    .where(
      and(
        eq(clientVideos.clientId, id),
        inArray(clientVideos.filePath, paths),
      ),
    );
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
