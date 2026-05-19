import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import {
  listDirectory,
  createFolder,
  moveEntry,
} from "@/lib/fs/storage";
import { moveToTrash } from "@/lib/fs/trash";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";

async function requireAuth() {
  const session = await getCurrentSession();
  if (!session) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { session };
}

// GET /api/files?path=/some/path  → 폴더 목록
export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const rel = req.nextUrl.searchParams.get("path") || "/";
  try {
    let entries = await listDirectory(rel);

    // 파트너: 본인이 업로드한 파일 + 폴더만 표시
    if (session!.role === "partner") {
      // 이 폴더 내 모든 파일의 소유권 조회
      const filePaths = entries
        .filter((e) => !e.isFolder)
        .map((e) => e.path);
      if (filePaths.length > 0) {
        const owned = await db
          .select({ path: fileUploads.path })
          .from(fileUploads)
          .where(inArray(fileUploads.path, filePaths));
        const ownedSet = new Set(owned.map((o) => o.path));
        // 파트너 본인이 올린 파일만 유지, 폴더는 그대로
        entries = entries.filter((e) => e.isFolder || ownedSet.has(e.path));
      } else {
        // 폴더만 있으면 그대로
      }
    }

    return NextResponse.json({ path: rel, entries });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// POST /api/files  body: { path, name } → 새 폴더 생성
export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.path || !body?.name) {
    return NextResponse.json({ error: "path and name required" }, { status: 400 });
  }
  const { path: parent, name } = body as { path: string; name: string };
  if (!/^[^/\\:*?"<>|]+$/.test(name)) {
    return NextResponse.json({ error: "invalid folder name" }, { status: 400 });
  }
  // 렌더링 zone 루트("/")에는 새 폴더 생성 금지 (Rendering 폴더만 허용)
  // 'Rendering' 자체는 이미 존재하므로 createFolder 가 EEXIST 로 막힘 — 별도 처리 불필요
  if ((parent === "/" || parent === "") && name !== "Rendering") {
    return NextResponse.json(
      { error: "렌더링 zone 루트에는 폴더를 만들 수 없어요. Rendering 폴더 안에서 작업하세요." },
      { status: 403 },
    );
  }
  const target = (parent.endsWith("/") ? parent : parent + "/") + name;
  try {
    await createFolder(target);
    return NextResponse.json({ ok: true, path: target });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PATCH /api/files  body: { from, to } → 이름 변경 또는 이동
export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.from || !body?.to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }
  const { from, to } = body as { from: string; to: string };

  // 파트너는 본인 업로드한 파일만 이동·이름변경 가능
  if (!(await canAccessFile(session!, from))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await moveEntry(from, to);
    return NextResponse.json({ ok: true, path: to });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/files?path=/foo/bar  → 휴지통으로 이동
export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const rel = req.nextUrl.searchParams.get("path");
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });

  // 파트너는 본인 업로드한 파일만 삭제 가능
  if (!(await canAccessFile(session!, rel))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const trashId = await moveToTrash(
      rel,
      session!.sub,
      session!.name ?? session!.username,
    );
    return NextResponse.json({ ok: true, trashId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
