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
    // Phase 1: UNIQUE(client_id, file_path) 도입 → 동시요청 race 시 위 존재검사를 둘 다 통과해
    // 한쪽이 unique 위반으로 throw 할 수 있다. onConflictDoNothing 으로 멱등하게 흡수(추가형·안전).
    // 마이그 미적용 상태(유니크 인덱스 없음)에서도 onConflict 는 no-op 으로 동작해 기존 흐름 보존.
    await db
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
      });
    added++;
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
