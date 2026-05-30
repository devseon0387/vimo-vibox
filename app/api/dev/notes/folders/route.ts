import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createFolder, renameFolder } from "@/lib/notes";
import { checkSameOrigin, csrfDeny } from "@/lib/auth/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(req: NextRequest) {
  if (!checkSameOrigin(req)) return csrfDeny();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const result = await createFolder(body.name);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;

  let body: { oldName?: string; newName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.oldName !== "string" || typeof body.newName !== "string") {
    return NextResponse.json({ error: "oldName, newName required" }, { status: 400 });
  }
  try {
    const result = await renameFolder(body.oldName, body.newName);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
