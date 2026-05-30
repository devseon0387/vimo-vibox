import { NextRequest } from "next/server";
import { like, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteIndex } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/notes/v2/suggest?q=문자열&limit=10
 *  → [{ title, path }]
 *
 * 노트 제목 부분 일치 자동완성. wiki-link `[[` 트리거.
 */
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10) || 10);

  if (!q) {
    // q 비어있으면 최근 노트
    const rows = await db
      .select({ path: noteIndex.path, title: noteIndex.title })
      .from(noteIndex)
      .orderBy(desc(noteIndex.modifiedAt))
      .limit(limit);
    return Response.json(
      { suggestions: rows.map((r) => ({ path: r.path, title: r.title ?? "(제목 없음)" })) },
      { headers: cors },
    );
  }

  const rows = await db
    .select({ path: noteIndex.path, title: noteIndex.title })
    .from(noteIndex)
    .where(like(noteIndex.title, `%${q}%`))
    .orderBy(desc(noteIndex.modifiedAt))
    .limit(limit);

  return Response.json(
    { suggestions: rows.map((r) => ({ path: r.path, title: r.title ?? "(제목 없음)" })) },
    { headers: cors },
  );
}
