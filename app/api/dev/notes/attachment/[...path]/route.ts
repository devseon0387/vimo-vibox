import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { readAttachment } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dev/notes/attachment/{key}/{filename}
 *   세션 기반 (admin only). 브라우저 WYSIWYG/미리보기에서 이미지 표시용.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: "path format: /key/filename" }, { status: 400 });
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
      "Cache-Control": "private, max-age=3600",
    },
  });
}
