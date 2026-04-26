import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
  notInArray,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, fileUploads, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * GET /api/inbox
 * 매니저 일일 워크플로우 진입점.
 *  - pendingReviews: 최근 14일 내 업로드된 파일 중 매니저 댓글이 0개인 것 (검수 대기)
 *  - pendingApprovals: 클라가 작성한 status='pending' 댓글들 (승인 대기)
 *
 * partner 역할은 이 페이지 의미 없음 → 404.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role === "partner") {
    return NextResponse.json({ error: "manager only" }, { status: 403 });
  }

  // 1) 검수 대기 — 최근 14일 업로드, 매니저(admin/member) 댓글 0개
  const since = new Date(Date.now() - 14 * 86400_000);
  const recentUploads = await db
    .select({
      path: fileUploads.path,
      uploadedBy: fileUploads.uploadedBy,
      uploadedByName: fileUploads.uploadedByName,
      uploadedAt: fileUploads.uploadedAt,
    })
    .from(fileUploads)
    .where(gte(fileUploads.uploadedAt, since))
    .orderBy(desc(fileUploads.uploadedAt))
    .limit(200);

  // 매니저 ID 셋 (admin/member)
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));
  const managerIds = managers.map((m) => m.id);

  // 매니저 댓글 있는 파일 path
  let reviewedSet = new Set<string>();
  if (managerIds.length > 0 && recentUploads.length > 0) {
    const reviewedRows = await db
      .selectDistinct({ filePath: comments.filePath })
      .from(comments)
      .where(
        and(
          inArray(comments.authorId, managerIds),
          inArray(
            comments.filePath,
            recentUploads.map((u) => u.path),
          ),
        ),
      );
    reviewedSet = new Set(reviewedRows.map((r) => r.filePath));
  }

  const pendingReviews = recentUploads
    .filter((u) => !reviewedSet.has(u.path))
    // 영상 우선 (확장자로 빠르게 체크)
    .filter((u) => /\.(mp4|mov|mkv|avi|webm|m4v)$/i.test(u.path))
    .slice(0, 30)
    .map((u) => ({
      path: u.path,
      uploadedBy: u.uploadedByName,
      uploadedAt: u.uploadedAt.getTime(),
    }));

  // 2) 승인 대기 — status='pending' 인 클라 댓글
  const pendingComments = await db
    .select({
      id: comments.id,
      filePath: comments.filePath,
      authorName: comments.authorName,
      guestName: comments.guestName,
      body: comments.body,
      videoTimeMs: comments.videoTimeMs,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(
      and(
        eq(comments.status, "pending"),
        // 게스트(클라) 댓글 위주 — 본인 매니저 댓글은 자동 approved 라 굳이 필터 불필요지만 안전
        isNull(comments.parentId),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(30);

  const pendingApprovals = pendingComments.map((c) => ({
    id: c.id,
    filePath: c.filePath,
    author: c.guestName ?? c.authorName,
    body: c.body,
    videoTimeMs: c.videoTimeMs,
    createdAt: c.createdAt.getTime(),
  }));

  return NextResponse.json({
    pendingReviews,
    pendingApprovals,
    counts: {
      review: pendingReviews.length,
      approval: pendingApprovals.length,
      total: pendingReviews.length + pendingApprovals.length,
    },
  });
}

export const runtime = "nodejs";
