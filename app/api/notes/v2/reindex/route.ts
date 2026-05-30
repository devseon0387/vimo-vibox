import { NextRequest } from "next/server";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { reindexAll } from "@/lib/notes-index";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * POST /api/notes/v2/reindex — admin 한정.
 * Notes/* 전체 풀스캔 후 note_index/note_fts 재구축.
 */
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const result = await reindexAll();
  return Response.json({ ok: true, ...result }, { headers: cors });
}
