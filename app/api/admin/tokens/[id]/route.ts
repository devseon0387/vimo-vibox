import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiTokens } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // 회수: revoked_at 채움 (실제 DELETE는 안 함, audit log 보존)
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.id, id));

  return NextResponse.json({ ok: true });
}
