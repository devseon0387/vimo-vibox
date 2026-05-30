import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { readNote, updateNote, deleteNote, moveNote } from "@/lib/notes";
import { checkSameOrigin, csrfDeny } from "@/lib/auth/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminGuard(req: NextRequest) {
  if (!checkSameOrigin(req)) return csrfDeny();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

function errResponse(err: unknown): NextResponse {
  const msg = err instanceof Error ? err.message : "failed";
  let status = 400;
  if (/찾을 수 없|not found|ENOENT/.test(msg)) status = 404;
  else if (/이미 존재|EEXIST|충돌/.test(msg)) status = 409;
  return NextResponse.json({ error: msg }, { status });
}

type PatchBody = {
  title?: string;
  content?: string;
  tags?: string[];
  starred?: boolean;
  append?: boolean;
  move?: { folder?: string; slug?: string };
};

export async function PATCH(req: NextRequest) {
  const denied = await adminGuard(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    let workingId = id;
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
      if (!fresh) throw new Error("재조회 실패");
      note = fresh;
    }

    return NextResponse.json({ ok: true, id: note.id, path: note.path });
  } catch (err) {
    return errResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await adminGuard(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errResponse(err);
  }
}
