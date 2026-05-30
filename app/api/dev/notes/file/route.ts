import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { readNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminGuard() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const note = await readNote(id);
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(note);
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
}
