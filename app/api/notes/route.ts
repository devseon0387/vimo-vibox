import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/api-auth";
import { listAllNotes, listFolders, listNotesInFolder, searchNotes } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notes
 *  Authorization: Bearer vbx_...  (scope: notes:read)
 *  Query:
 *    folder=<name>     특정 폴더만
 *    q=<text>          본문/제목 검색 (q 우선)
 *    tag=<name>        태그 필터
 *    starred=1         즐겨찾기만
 *    limit=<n>         최대 (기본 100, 최대 500)
 *  → { folders, notes }
 */
export async function GET(req: NextRequest) {
  const auth = await requireScope(req, "notes:read");
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const folder = sp.get("folder")?.trim();
  const q = sp.get("q")?.trim();
  const tag = sp.get("tag")?.trim();
  const starredOnly = sp.get("starred") === "1";
  const limitRaw = parseInt(sp.get("limit") ?? "100", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);

  const folders = await listFolders();

  let notes;
  if (q) {
    const hits = await searchNotes(q, limit);
    notes = hits.map((h) => ({
      id: h.id,
      folder: h.folder,
      title: h.title,
      excerpt: h.snippet,
      tags: [],
      starred: false,
      updated: h.updated,
      size: 0,
    }));
  } else if (folder) {
    notes = await listNotesInFolder(folder);
  } else {
    notes = await listAllNotes();
  }

  if (tag) notes = notes.filter((n) => n.tags?.includes(tag));
  if (starredOnly) notes = notes.filter((n) => n.starred);
  notes = notes.slice(0, limit);

  return NextResponse.json({
    folders,
    notes,
    tokenName: auth.token.name,
  });
}
