/**
 * GET /api/admin/ai-feedback
 *
 * AI 검수 평가 피드백 전체 조회 (admin only).
 *
 * Query:
 *   format=json     — 분석용 JSON 덤프 (Claude 에게 붙여넣을 수 있는 형태)
 *   format=summary  — 라벨별 카운트 통계만 (기본값)
 */
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiReviewFeedback, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format") ?? "summary";

  const rows = await db
    .select({
      id: aiReviewFeedback.id,
      commentId: aiReviewFeedback.commentId,
      filePath: aiReviewFeedback.filePath,
      reporterId: aiReviewFeedback.reporterId,
      reporterName: users.name,
      verdict: aiReviewFeedback.verdict,
      reasonTag: aiReviewFeedback.reasonTag,
      note: aiReviewFeedback.note,
      aiBody: aiReviewFeedback.aiBody,
      aiSuggestion: aiReviewFeedback.aiSuggestion,
      aiOcrWrong: aiReviewFeedback.aiOcrWrong,
      videoTimeMs: aiReviewFeedback.videoTimeMs,
      createdAt: aiReviewFeedback.createdAt,
    })
    .from(aiReviewFeedback)
    .leftJoin(users, eq(aiReviewFeedback.reporterId, users.id))
    .orderBy(desc(aiReviewFeedback.createdAt));

  // 통계 집계
  const stats = {
    total: rows.length,
    good: 0,
    bad: 0,
    partial: 0,
    byReason: {} as Record<string, number>,
  };
  for (const r of rows) {
    if (r.verdict === "good") stats.good++;
    else if (r.verdict === "bad") stats.bad++;
    else if (r.verdict === "partial") stats.partial++;
    if (r.reasonTag) {
      stats.byReason[r.reasonTag] = (stats.byReason[r.reasonTag] ?? 0) + 1;
    }
  }

  if (format === "json") {
    // Claude 가 붙여넣어 분석할 수 있는 형태로 — 스냅샷 포함
    const dump = rows.map((r) => ({
      verdict: r.verdict,
      reasonTag: r.reasonTag,
      note: r.note,
      ocrWrong: r.aiOcrWrong,
      suggestion: r.aiSuggestion,
      aiBody: r.aiBody,
      filePath: r.filePath,
      videoTimeMs: r.videoTimeMs,
      reporter: r.reporterName,
      at: r.createdAt?.getTime(),
    }));
    return NextResponse.json({ stats, items: dump });
  }

  return NextResponse.json({
    stats,
    items: rows.map((r) => ({
      id: r.id,
      commentId: r.commentId,
      filePath: r.filePath,
      reporterName: r.reporterName,
      verdict: r.verdict,
      reasonTag: r.reasonTag,
      note: r.note,
      ocrWrong: r.aiOcrWrong,
      suggestion: r.aiSuggestion,
      aiBody: r.aiBody,
      videoTimeMs: r.videoTimeMs,
      createdAt: r.createdAt?.getTime(),
    })),
  });
}
