import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteVersions } from "@/lib/db/schema";
import { guardNotesV2 } from "@/lib/auth/notes-guard";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/notes/v2/version?id=<versionId>
 * 단건 버전 본문 (목록은 별도 endpoint에서 body 미포함)
 */
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const g = await guardNotesV2(req, cors);
  if (g.res) return g.res;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400, headers: cors });

  const [v] = await db.select().from(noteVersions).where(eq(noteVersions.id, id)).limit(1);
  if (!v) return Response.json({ error: "not found" }, { status: 404, headers: cors });

  return Response.json(
    {
      id: v.id,
      path: v.path,
      body: v.body,
      savedAt: v.savedAt,
      savedBy: v.savedBy,
      reason: v.reason,
      bytes: v.bytes,
    },
    { headers: cors },
  );
}
