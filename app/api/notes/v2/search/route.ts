import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/notes/v2/search?q=keyword&limit=20
 * FTS5 bm25 + 스니펫.
 */
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ hits: [] }, { headers: cors });
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20);

  // 한국어 FTS5 검색은 prefix 매칭이 자연어와 잘 안 맞음 → 단어 모두 *로 prefix
  // 보수적으로 토큰화 (공백 split + 짧은 토큰 skip)
  const tokens = q
    .split(/\s+/)
    .filter((t) => t.length >= 1)
    .map((t) => t.replace(/["]/g, "")) // FTS5 special escape
    .map((t) => (t.length >= 2 ? `"${t}"*` : `"${t}"`))
    .join(" ");

  try {
    const rows = await db.all<{
      path: string;
      title: string;
      body_snip: string;
      rank: number;
    }>(
      sql`SELECT path, title,
            snippet(note_fts, 2, '[[', ']]', '…', 20) AS body_snip,
            bm25(note_fts) AS rank
          FROM note_fts
          WHERE note_fts MATCH ${tokens}
          ORDER BY rank
          LIMIT ${limit}`,
    );
    return Response.json(
      {
        hits: rows.map((r) => ({
          path: r.path,
          title: r.title,
          snippet: r.body_snip,
        })),
      },
      { headers: cors },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search failed";
    return Response.json({ error: msg, hits: [] }, { status: 500, headers: cors });
  }
}
