import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { checkSameOrigin, csrfDeny } from "@/lib/auth/csrf";
import { saveAttachment } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminGuard(req: NextRequest) {
  if (!checkSameOrigin(req)) return csrfDeny();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/**
 * POST /api/dev/notes/attachment
 *   multipart/form-data:
 *     noteId   = "folder/slug"
 *     file     = binary
 *     filename = "screenshot.png" (선택, file에서 추정)
 *   → 200 { ok, path, url, size, mime }
 *
 * 브라우저 WYSIWYG 에디터용 — 세션 기반 인증.
 */
export async function POST(req: NextRequest) {
  const denied = await adminGuard(req);
  if (denied) return denied;

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
    // result.url 은 `/api/notes/attachment/{key}/{filename}` (API key 인증).
    // 브라우저(세션 인증)에서 표시할 수 있게 dev 경로로 재작성.
    const devUrl = result.url.replace(
      "/api/notes/attachment/",
      "/api/dev/notes/attachment/",
    );
    return NextResponse.json({
      ok: true,
      path: result.path,
      url: devUrl,
      apiUrl: result.url, // 비봇/API 클라이언트용 (Bearer 인증)
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
