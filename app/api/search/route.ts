import { NextRequest, NextResponse } from "next/server";
import { desc, like, or, and, inArray, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { comments, shareLinks, fileUploads } from "@/lib/db/schema";
import { searchFiles } from "@/lib/fs/storage";
import type { FileEntry } from "@/lib/fs/storage";
import { searchNotes } from "@/lib/notes";

/**
 * GET /api/search?q=...&kinds=files,comments,shares,notes
 *  → ⌘K 통합 검색
 *  - kinds 미지정 시 모두
 *  - notes는 admin만
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ files: [], comments: [], shares: [], notes: [] });
  }
  const kindsParam = req.nextUrl.searchParams.get("kinds");
  const wantedKinds = new Set(
    kindsParam
      ? kindsParam.split(",").map((s) => s.trim())
      : ["files", "comments", "shares", "notes"],
  );

  const [files, cmts, shares, notes] = await Promise.all([
    wantedKinds.has("files") ? searchFilesScoped(q, session) : Promise.resolve([]),
    wantedKinds.has("comments") ? searchComments(q, session) : Promise.resolve([]),
    wantedKinds.has("shares") ? searchShares(q, session) : Promise.resolve([]),
    wantedKinds.has("notes") && session.role === "admin"
      ? searchNotes(q, 12)
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ files, comments: cmts, shares, notes });
}

async function searchFilesScoped(
  q: string,
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>,
): Promise<FileEntry[]> {
  let results = await searchFiles(q);
  if (session.role === "partner") {
    const filePaths = results.filter((e) => !e.isFolder).map((e) => e.path);
    if (filePaths.length > 0) {
      const owned = await db
        .select({ path: fileUploads.path, uploadedBy: fileUploads.uploadedBy })
        .from(fileUploads)
        .where(inArray(fileUploads.path, filePaths));
      const ownedSet = new Set(
        owned.filter((o) => o.uploadedBy === session.sub).map((o) => o.path),
      );
      results = results.filter((e) => e.isFolder || ownedSet.has(e.path));
    }
  }
  return results.slice(0, 20);
}

type CommentHit = {
  id: string;
  filePath: string;
  body: string; // 매칭된 본문(순화본 우선)
  authorName: string;
  videoTimeMs: number;
  createdAt: number;
};

async function searchComments(
  q: string,
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>,
): Promise<CommentHit[]> {
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select({
      id: comments.id,
      filePath: comments.filePath,
      body: comments.body,
      moderatedBody: comments.moderatedBody,
      authorName: comments.authorName,
      videoTimeMs: comments.videoTimeMs,
      createdAt: comments.createdAt,
      authorId: comments.authorId,
    })
    .from(comments)
    .where(or(like(comments.body, pattern), like(comments.moderatedBody, pattern)))
    .orderBy(desc(comments.createdAt))
    .limit(50);

  // 권한 필터: canAccessFile (파일 단위 검사)
  const filtered: CommentHit[] = [];
  for (const r of rows) {
    if (filtered.length >= 15) break;
    if (!(await canAccessFile(session, r.filePath))) continue;
    filtered.push({
      id: r.id,
      filePath: r.filePath,
      body: r.moderatedBody ?? r.body,
      authorName: r.authorName,
      videoTimeMs: r.videoTimeMs,
      createdAt: r.createdAt.getTime(),
    });
  }
  return filtered;
}

type ShareHit = {
  token: string;
  title: string | null;
  filePath: string;
  createdAt: number;
};

async function searchShares(
  q: string,
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>,
): Promise<ShareHit[]> {
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  // admin/member 는 모든 공유, partner 는 본인 생성한 것만
  const baseWhere = or(
    like(shareLinks.title, pattern),
    like(shareLinks.filePath, pattern),
  );
  const rows = await db
    .select({
      token: shareLinks.token,
      title: shareLinks.title,
      filePath: shareLinks.filePath,
      createdAt: shareLinks.createdAt,
      createdBy: shareLinks.createdBy,
    })
    .from(shareLinks)
    .where(
      session.role === "partner"
        ? and(baseWhere, eq(shareLinks.createdBy, session.sub))
        : baseWhere,
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(15);

  return rows.map((r) => ({
    token: r.token,
    title: r.title,
    filePath: r.filePath,
    createdAt: r.createdAt.getTime(),
  }));
}

export const runtime = "nodejs";
