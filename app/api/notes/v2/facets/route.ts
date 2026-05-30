import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteIndex } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/notes/v2/facets
 * 사이드바용 폴더·태그 집계.
 */
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  // 폴더: DISTINCT + count
  const folders = await db.all<{ folder: string; n: number }>(
    sql`SELECT folder, COUNT(*) AS n
        FROM note_index
        WHERE folder IS NOT NULL
        GROUP BY folder
        ORDER BY folder`,
  );

  // 태그: JSON 컬럼에서 추출 — note 개수 적으면 JS로 집계가 더 간단
  const rows = await db
    .select({ tags: noteIndex.tags })
    .from(noteIndex);
  const tagMap = new Map<string, number>();
  for (const r of rows) {
    if (!r.tags) continue;
    try {
      const arr = JSON.parse(r.tags) as unknown;
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        if (typeof t !== "string" || !t) continue;
        tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }
  const tags = Array.from(tagMap.entries())
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);

  const totalCount = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM note_index`);
  const starredCount = await db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM note_index WHERE starred = 1`,
  );

  return Response.json(
    {
      folders: folders.map((f) => ({ name: f.folder, n: f.n })),
      tags,
      total: totalCount[0]?.n ?? 0,
      starred: starredCount[0]?.n ?? 0,
    },
    { headers: cors },
  );
}
