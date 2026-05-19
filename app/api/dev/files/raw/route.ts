import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { readRawFile } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  try {
    const file = await readRawFile(path);
    if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(file);
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
}
