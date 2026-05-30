import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listAllNotes, listFolders, listNotesInFolder } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const folder = req.nextUrl.searchParams.get("folder");
  const folders = await listFolders();
  const notes = folder ? await listNotesInFolder(folder) : await listAllNotes();
  return NextResponse.json({ folders, notes });
}
