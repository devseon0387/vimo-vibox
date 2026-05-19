import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listFileTree } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const tree = await listFileTree();
  return NextResponse.json({ tree });
}
