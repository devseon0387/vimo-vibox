import { NextRequest } from "next/server";
import { and, desc, eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteIndex } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const url = new URL(req.url);
  const folder = url.searchParams.get("folder");
  const tag = url.searchParams.get("tag");
  const starred = url.searchParams.get("starred") === "1";
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50);

  const conds = [];
  if (folder) conds.push(eq(noteIndex.folder, folder));
  if (starred) conds.push(eq(noteIndex.starred, true));
  if (tag) conds.push(like(noteIndex.tags, `%"${tag}"%`));

  const rows = await db
    .select()
    .from(noteIndex)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(noteIndex.modifiedAt))
    .limit(limit);

  return Response.json(
    {
      items: rows.map((r) => ({
        path: r.path,
        title: r.title,
        excerpt: r.excerpt,
        tags: r.tags ? safeJsonArray(r.tags) : [],
        folder: r.folder,
        wordCount: r.wordCount,
        mtimeMs: r.modifiedAt,
        starred: !!r.starred,
      })),
    },
    { headers: cors },
  );
}

function safeJsonArray(raw: string): string[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
