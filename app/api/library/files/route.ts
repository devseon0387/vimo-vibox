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
 * 자료실(Library) — 팀 공용 레퍼런스·템플릿 보관.
 * 모든 로그인 유저 읽기, staff(admin/member)만 쓰기.
 */
function toFullPath(rel: string): string {
  const safe = rel.startsWith("/") ? rel : "/" + rel;
  return `/library${safe === "/" ? "" : safe}`;
}

function stripPrefix(fullPath: string): string {
  if (fullPath === "/library") return "/";
  if (fullPath.startsWith("/library/")) return fullPath.slice("/library".length);
  return fullPath;
}

// GET /api/library/files?path=/folder1 — 목록 (로그인만)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path") ?? "/";
  const fullPath = toFullPath(rel);

  try {
    await ensureDir("/library");
  } catch {}

  let entries: FileEntry[];
  try {
    entries = await listDirectory(fullPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const mapped = entries.map((e) => ({
    ...e,
    path: stripPrefix(e.path),
  }));

  return NextResponse.json({
    path: rel,
    entries: mapped,
    canWrite: session.role === "admin" || session.role === "member",
  });
}

// POST /api/library/files  body: { path, name } — 새 폴더 (staff만)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "staff only" }, { status: 403 });
  }

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
  const fullPath = toFullPath(targetRel);

  try {
    await createFolder(fullPath);
    return NextResponse.json({ ok: true, path: targetRel });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/library/files?path=/x (staff만)
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "member") {
    return NextResponse.json({ error: "staff only" }, { status: 403 });
  }

  const rel = req.nextUrl.searchParams.get("path");
  if (!rel || rel === "/") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const fullPath = toFullPath(rel);

  try {
    await moveToTrash(fullPath, session.sub, session.name ?? session.username);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export const runtime = "nodejs";
