/**
 * /api/comments/[id]/ai-feedback
 *
 * AI 검수 댓글에 대한 사용자 평가를 저장/조회.
 *
 * POST body: { verdict: 'good'|'bad'|'partial', reasonTag?, note? }
 *   - 본인 user 의 평가를 upsert (한 댓글당 1건).
 *   - 댓글이 AI 검수 (`author_id='ai-reviewer'`) 여야 함.
 *   - 댓글 본문/제안/OCR원문 스냅샷을 같이 저장.
 *
 * GET: 본인 평가만 (없으면 null).
 *
 * DELETE: 본인 평가 취소.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiReviewFeedback, comments } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { parseAnnotation } from "@/lib/comments/annotation";

const VALID_VERDICTS = new Set(["good", "bad", "partial"]);
const VALID_REASONS = new Set([
  "ocr_misread",
  "wrong_correction",
  "context_wrong",
  "not_a_typo",
  "partial_fix",
  "other",
]);

async function loadAiComment(commentId: string) {
  const [row] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) return null;
  if (row.authorId !== "ai-reviewer") return null;
  return row;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: commentId } = await params;
  const body = await req.json().catch(() => null);
  const verdict = body?.verdict;
  const reasonTag = body?.reasonTag ?? null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : null;

  if (!VALID_VERDICTS.has(verdict)) {
    return NextResponse.json({ error: "invalid verdict" }, { status: 400 });
  }
  if (verdict !== "good" && reasonTag && !VALID_REASONS.has(reasonTag)) {
    return NextResponse.json({ error: "invalid reasonTag" }, { status: 400 });
  }

  const aiComment = await loadAiComment(commentId);
  if (!aiComment) {
    return NextResponse.json({ error: "AI 댓글이 아니거나 존재하지 않습니다" }, { status: 404 });
  }

  // 스냅샷 — body 패턴: `"틀린단어" → "수정단어" · 사유`
  let aiOcrWrong: string | null = null;
  let aiSuggestion: string | null = null;
  const annotation = parseAnnotation(aiComment.annotation);
  if (annotation) {
    aiOcrWrong = annotation.original ?? null;
    aiSuggestion = annotation.suggestion ?? null;
  }

  const now = new Date();
  const existing = await db
    .select()
    .from(aiReviewFeedback)
    .where(
      and(
        eq(aiReviewFeedback.commentId, commentId),
        eq(aiReviewFeedback.reporterId, session.sub),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiReviewFeedback)
      .set({
        verdict,
        reasonTag: verdict === "good" ? null : reasonTag,
        note,
        aiBody: aiComment.body,
        aiSuggestion,
        aiOcrWrong,
        videoTimeMs: aiComment.videoTimeMs,
      })
      .where(eq(aiReviewFeedback.id, existing[0].id));
    return NextResponse.json({ ok: true, id: existing[0].id, updated: true });
  }

  const id = randomUUID();
  await db.insert(aiReviewFeedback).values({
    id,
    commentId,
    filePath: aiComment.filePath,
    reporterId: session.sub,
    verdict,
    reasonTag: verdict === "good" ? null : reasonTag,
    note,
    aiBody: aiComment.body,
    aiSuggestion,
    aiOcrWrong,
    videoTimeMs: aiComment.videoTimeMs,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, id, created: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: commentId } = await params;
  const [row] = await db
    .select()
    .from(aiReviewFeedback)
    .where(
      and(
        eq(aiReviewFeedback.commentId, commentId),
        eq(aiReviewFeedback.reporterId, session.sub),
      ),
    )
    .limit(1);

  return NextResponse.json({ feedback: row ?? null });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: commentId } = await params;
  await db
    .delete(aiReviewFeedback)
    .where(
      and(
        eq(aiReviewFeedback.commentId, commentId),
        eq(aiReviewFeedback.reporterId, session.sub),
      ),
    );

  return NextResponse.json({ ok: true });
}
