import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { noteVersions } from "@/lib/db/schema";
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

  const notePath = req.nextUrl.searchParams.get("path");
  if (!notePath) return Response.json({ error: "path required" }, { status: 400, headers: cors });
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50);

  const rows = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.path, notePath))
    .orderBy(desc(noteVersions.savedAt))
    .limit(limit);

  return Response.json(
    {
      versions: rows.map((r) => ({
        id: r.id,
        savedAt: r.savedAt,
        savedBy: r.savedBy,
        reason: r.reason,
        bytes: r.bytes,
        // body는 별도 GET 요구 (목록은 가벼워야)
      })),
    },
    { headers: cors },
  );
}
