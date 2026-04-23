import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const snap = await getHealthSnapshot();
    return NextResponse.json(snap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
