import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getCurrentSession } from "@/lib/auth/session";
import {
  listDirectory,
  createFolder,
  ensureDir,
  type FileEntry,
} from "@/lib/fs/storage";
import { moveToTrash } from "@/lib/fs/trash";

/**
 * 개인 드라이브 파일 API.
 * URL 파라미터 path 는 개인 드라이브 기준 상대 경로(`/`, `/폴더1/`).
 * 서버가 자동으로 /personal/{sub}/ 접두어를 붙여 실제 경로로 변환.
 */
function toFullPath(sub: string, rel: string): string {
  const safe = rel.startsWith("/") ? rel : "/" + rel;
  return `/personal/${sub}${safe === "/" ? "" : safe}`;
}

function stripPrefix(fullPath: string, personalRoot: string): string {
  if (fullPath === personalRoot) return "/";
  if (fullPath.startsWith(personalRoot + "/")) {
    return fullPath.slice(personalRoot.length);
  }
  return fullPath;
}

// GET /api/my/box/files?path=/folder1
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path") ?? "/";
  const personalRoot = `/personal/${session.sub}`;
  const fullPath = toFullPath(session.sub, rel);

  // 최초 진입 시 개인 루트 자동 생성
  try {
    await ensureDir(personalRoot);
  } catch {}

  let entries: FileEntry[];
  try {
    entries = await listDirectory(fullPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 사용자에게 노출되는 path 는 /personal/{sub} 접두어 제거
  const mapped = entries.map((e) => ({
    ...e,
    path: stripPrefix(e.path, personalRoot),
  }));

  return NextResponse.json({ path: rel, entries: mapped });
}

// POST /api/my/box/files  body: { path, name }
// 새 폴더 생성
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const name = String(body.name);
  if (!/^[^/\\:*?"<>|]+$/.test(name)) {
    return NextResponse.json({ error: "invalid folder name" }, { status: 400 });
  }

  const parent = typeof body.path === "string" ? body.path : "/";
  const targetRel = path.posix.join(
    parent.startsWith("/") ? parent : "/" + parent,
    name,
  );
  const fullPath = toFullPath(session.sub, targetRel);

  try {
    await createFolder(fullPath);
    return NextResponse.json({ ok: true, path: targetRel });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/my/box/files?path=/foo.mp4
// 휴지통으로 이동
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path");
  if (!rel || rel === "/") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const fullPath = toFullPath(session.sub, rel);

  try {
    await moveToTrash(
      fullPath,
      session.sub,
      session.name ?? session.username,
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export const runtime = "nodejs";
