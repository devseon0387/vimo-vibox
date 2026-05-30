import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/api-auth";
import { writeNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "https://vibox.cloud";

type Body = {
  folder?: string;
  title?: string;
  content?: string;
  tags?: string[];
  starred?: boolean;
  slug?: string;
  overwrite?: boolean;
};

/**
 * POST /api/notes/save
 *  Authorization: Bearer vbx_...
 *  Body: { folder, title, content, tags?, starred?, slug?, overwrite? }
 *  → 외장 SSD Notes/{folder}/{slug}.md 로 저장
 */
export async function POST(req: NextRequest) {
  const auth = await requireScope(req, "notes:write");
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const folder = (body.folder ?? "_inbox").trim();
  const title = (body.title ?? "").trim();
  const content = body.content ?? "";

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (typeof folder !== "string") {
    return NextResponse.json({ error: "folder must be string" }, { status: 400 });
  }

  try {
    const result = await writeNote({
      folder,
      title,
      content,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      starred: !!body.starred,
      slug: body.slug,
      overwrite: !!body.overwrite,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      path: result.path,
      url: `${PUBLIC_BASE}${result.url}`,
      created: result.created,
      tokenName: auth.token.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
