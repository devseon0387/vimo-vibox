import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import { db } from "@/lib/db/client";
import { noteIndex } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { absFromNotePath, reindexNote } from "@/lib/notes-index";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const notePath = req.nextUrl.searchParams.get("path");
  if (!notePath || !notePath.startsWith("/notes/")) {
    return Response.json({ error: "path required" }, { status: 400, headers: cors });
  }

  const abs = absFromNotePath(notePath);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400, headers: cors });

  let raw: string;
  let stat: import("node:fs").Stats;
  try {
    raw = await fs.readFile(abs, "utf-8");
    stat = await fs.stat(abs);
  } catch {
    return Response.json({ error: "not found" }, { status: 404, headers: cors });
  }

  const parsed = matter(raw);
  const meta = parsed.data as Record<string, unknown>;
  const mtimeMs = Math.floor(stat.mtimeMs);

  // 인덱스가 stale 하면 백그라운드로 갱신 (응답은 막지 않음)
  const [indexed] = await db
    .select({ modifiedAt: noteIndex.modifiedAt })
    .from(noteIndex)
    .where(eq(noteIndex.path, notePath))
    .limit(1);
  if (!indexed || indexed.modifiedAt !== mtimeMs) {
    reindexNote(notePath).catch(() => {});
  }

  return Response.json(
    {
      path: notePath,
      body: parsed.content,
      meta,
      mtimeMs,
      bytes: stat.size,
    },
    { headers: cors },
  );
}
