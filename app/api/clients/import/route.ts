import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { fetchErpClients } from "@/lib/erp";

function makeSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w가-힣\-]/g, "")
      .slice(0, 60) || "client"
  );
}

// GET /api/clients/import → ERP 후보 목록 + Vibox 측 이미 import 된 항목 표시
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }

  let erpRows;
  try {
    erpRows = await fetchErpClients();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 이미 import 된 ERP id 셋
  const erpIds = erpRows.map((r) => r.id);
  let imported = new Set<string>();
  if (erpIds.length > 0) {
    const rows = await db
      .select({ erpId: clients.erpClientId })
      .from(clients)
      .where(inArray(clients.erpClientId, erpIds));
    imported = new Set(rows.map((r) => r.erpId).filter(Boolean) as string[]);
  }

  return NextResponse.json({
    candidates: erpRows.map((r) => ({
      erpId: r.id,
      name: r.name,
      email: r.email,
      contactPerson: r.contact_person,
      company: r.company,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
      alreadyImported: imported.has(r.id),
    })),
  });
}

// POST /api/clients/import body: { erpIds: string[] }
// → 선택한 ERP 클라들 일괄 import
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const erpIds: string[] = Array.isArray(body?.erpIds) ? body.erpIds : [];
  if (erpIds.length === 0) {
    return NextResponse.json({ error: "erpIds required" }, { status: 400 });
  }

  let erpRows;
  try {
    erpRows = await fetchErpClients();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const erpById = new Map(erpRows.map((r) => [r.id, r]));

  // 이미 있는 것 skip
  const existing = await db
    .select({ erpId: clients.erpClientId })
    .from(clients)
    .where(inArray(clients.erpClientId, erpIds));
  const existingSet = new Set(
    existing.map((e) => e.erpId).filter(Boolean) as string[],
  );

  let added = 0;
  for (const eid of erpIds) {
    if (existingSet.has(eid)) continue;
    const row = erpById.get(eid);
    if (!row) continue;

    // slug 충돌 회피
    let baseSlug = makeSlug(row.name);
    let slug = baseSlug;
    for (let i = 1; i < 1000; i++) {
      const dup = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.slug, slug))
        .limit(1);
      if (dup.length === 0) break;
      slug = `${baseSlug}-${i}`;
    }

    await db.insert(clients).values({
      id: randomUUID(),
      name: row.name,
      slug,
      contactEmail: row.email || null,
      notes: row.notes || null,
      active: row.status === "active",
      erpClientId: row.id,
      createdBy: session.sub,
    });
    added++;
  }
  return NextResponse.json({
    ok: true,
    added,
    skipped: existingSet.size,
  });
}

export const runtime = "nodejs";
