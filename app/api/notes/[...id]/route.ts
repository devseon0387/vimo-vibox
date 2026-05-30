import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/api-auth";
import { readNote, updateNote, deleteNote, moveNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "https://vibox.cloud";

function joinId(parts: string[]): string {
  return parts.map(decodeURIComponent).join("/");
}

function errStatus(err: unknown): number {
  const msg = err instanceof Error ? err.message : "";
  if (/찾을 수 없|not found|ENOENT/.test(msg)) return 404;
  if (/이미 존재|EEXIST|충돌/.test(msg)) return 409;
  return 400;
}

function errResponse(err: unknown): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "failed" },
    { status: errStatus(err) },
  );
}

/**
 * GET /api/notes/{folder}/{slug}
 *  scope: notes:read
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string[] }> },
) {
  const auth = await requireScope(req, "notes:read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.length < 2) {
    return NextResponse.json({ error: "id format: folder/slug" }, { status: 400 });
  }

  try {
    const note = await readNote(joinId(id));
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      ...note,
      url: `${PUBLIC_BASE}/dev/notes?id=${encodeURIComponent(note.id)}`,
    });
  } catch (err) {
    return errResponse(err);
  }
}

/**
 * DELETE /api/notes/{folder}/{slug}
 *  scope: notes:write
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string[] }> },
) {
  const auth = await requireScope(req, "notes:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.length < 2) {
    return NextResponse.json({ error: "id format: folder/slug" }, { status: 400 });
  }

  try {
    await deleteNote(joinId(id));
    return NextResponse.json({ ok: true, tokenName: auth.token.name });
  } catch (err) {
    return errResponse(err);
  }
}

type PatchBody = {
  title?: string;
  content?: string;
  tags?: string[];
  starred?: boolean;
  append?: boolean;
  move?: { folder?: string; slug?: string };
};

/**
 * PATCH /api/notes/{folder}/{slug}
 *  scope: notes:write
 *  Body: { title?, content?, tags?, starred?, append? }
 *    - 누락된 필드는 기존 값 유지
 *    - append=true 면 content를 기존 본문 끝에 이어붙임
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string[] }> },
) {
  const auth = await requireScope(req, "notes:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.length < 2) {
    return NextResponse.json({ error: "id format: folder/slug" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    let workingId = joinId(id);

    // move/rename 먼저 (경로가 바뀌면 이후 update가 새 위치에 적용)
    if (body.move && (body.move.folder || body.move.slug)) {
      const moved = await moveNote({
        id: workingId,
        newFolder: body.move.folder,
        newSlug: body.move.slug,
      });
      workingId = moved.newId;
    }

    const hasContentUpdate =
      body.title !== undefined ||
      body.content !== undefined ||
      body.tags !== undefined ||
      body.starred !== undefined;

    let note;
    if (hasContentUpdate) {
      note = await updateNote({
        id: workingId,
        title: typeof body.title === "string" ? body.title : undefined,
        content: typeof body.content === "string" ? body.content : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        starred: typeof body.starred === "boolean" ? body.starred : undefined,
        append: !!body.append,
      });
    } else {
      const fresh = await readNote(workingId);
      if (!fresh) throw new Error("이동 후 노트 조회 실패");
      note = fresh;
    }

    return NextResponse.json({
      ok: true,
      id: note.id,
      path: note.path,
      url: `${PUBLIC_BASE}/dev/notes?id=${encodeURIComponent(note.id)}`,
      tokenName: auth.token.name,
    });
  } catch (err) {
    return errResponse(err);
  }
}
