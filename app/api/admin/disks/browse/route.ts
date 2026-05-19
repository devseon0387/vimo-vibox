import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { browseUnderZone } from "@/lib/disks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = req.nextUrl.searchParams.get("path");
  if (!p) return NextResponse.json({ error: "path required" }, { status: 400 });

  try {
    const listing = await browseUnderZone(p);
    return NextResponse.json(listing);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
