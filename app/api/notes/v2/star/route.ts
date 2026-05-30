import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { absFromNotePath, reindexNote } from "@/lib/notes-index";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const body = (await req.json().catch(() => null)) as { path?: string; starred?: boolean } | null;
  if (!body?.path || typeof body.starred !== "boolean") {
    return Response.json({ error: "path, starred required" }, { status: 400, headers: cors });
  }
  const abs = absFromNotePath(body.path);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400, headers: cors });

  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf-8");
  } catch {
    return Response.json({ error: "not found" }, { status: 404, headers: cors });
  }
  const parsed = matter(raw);
  const meta = { ...(parsed.data as Record<string, unknown>), starred: body.starred };
  await fs.writeFile(abs, matter.stringify(parsed.content, meta), "utf-8");
  await reindexNote(body.path);

  return Response.json({ ok: true }, { headers: cors });
}
