import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteVersions } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";
import { absFromNotePath, reindexNote, recordVersion } from "@/lib/notes-index";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;
  const session = g.session;

  const body = (await req.json().catch(() => null)) as { path?: string; versionId?: string } | null;
  if (!body?.path || !body.versionId) {
    return Response.json({ error: "path, versionId required" }, { status: 400, headers: cors });
  }

  const [v] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.id, body.versionId))
    .limit(1);
  if (!v || v.path !== body.path) {
    return Response.json({ error: "version not found" }, { status: 404, headers: cors });
  }

  const abs = absFromNotePath(body.path);
  if (!abs) return Response.json({ error: "invalid path" }, { status: 400, headers: cors });

  // 현재 본문을 먼저 백업으로 기록 (복원 전 상태 보존)
  let currentBody = "";
  try {
    const raw = await fs.readFile(abs, "utf-8");
    currentBody = matter(raw).content;
  } catch {
    /* 없으면 무시 */
  }
  if (currentBody) {
    await recordVersion({
      path: body.path,
      body: currentBody,
      savedBy: session.sub,
      reason: "restore",
    });
  }

  // 메타 보존하면서 본문만 교체
  let meta: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(abs, "utf-8");
    meta = matter(raw).data as Record<string, unknown>;
  } catch {
    /* 신규 케이스는 메타 없음 */
  }
  await fs.writeFile(abs, matter.stringify(v.body, meta), "utf-8");
  const idx = await reindexNote(body.path);

  return Response.json(
    { ok: true, mtimeMs: idx.ok ? idx.mtimeMs : null },
    { headers: cors },
  );
}
