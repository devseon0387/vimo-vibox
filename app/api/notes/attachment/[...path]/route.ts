import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/api-auth";
import { readAttachment } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notes/attachment/{key}/{filename}
 *  - key      = note id에 / → __ 변환 (예: "프로젝트__vibox-사이드바-리디자인")
 *  - filename = "screenshot.png"
 *  Authorization: Bearer vbx_...  (scope: notes:read)
 *  → 이미지 binary + 적절한 Content-Type
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireScope(req, "notes:read");
  if (auth instanceof NextResponse) return auth;

  const { path: pathSegments } = await params;
  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json(
      { error: "path format: /key/filename" },
      { status: 400 },
    );
  }
  const key = decodeURIComponent(pathSegments[0]);
  const filename = decodeURIComponent(pathSegments.slice(1).join("/"));

  const result = await readAttachment(key, filename);
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mime,
      "Content-Length": String(result.size),
      "Cache-Control": "private, max-age=86400",
      "Last-Modified": new Date(result.mtime).toUTCString(),
    },
  });
}
