import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/api-auth";
import { saveAttachment } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "https://vibox.cloud";

/**
 * POST /api/notes/attachment
 *  Authorization: Bearer vbx_...  (scope: notes:write)
 *  multipart/form-data:
 *    noteId   = "folder/slug"
 *    filename = "screenshot.png" (선택, file에서 추정)
 *    file     = binary
 *  → 200 { ok, path, url, size, mime }
 */
export async function POST(req: NextRequest) {
  const auth = await requireScope(req, "notes:write");
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  const noteId = String(form.get("noteId") ?? "").trim();
  if (!noteId) {
    return NextResponse.json({ error: "noteId required (folder/slug)" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filename = String(form.get("filename") ?? (file as File).name ?? "").trim();
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const result = await saveAttachment({
      noteId,
      filename,
      bytes,
      mime: file.type || undefined,
    });
    return NextResponse.json({
      ok: true,
      path: result.path,
      url: `${PUBLIC_BASE}${result.url}`,
      size: result.size,
      mime: result.mime,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 },
    );
  }
}
