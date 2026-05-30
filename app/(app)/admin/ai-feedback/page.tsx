import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiReviewFeedback, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { AiFeedbackAdminView } from "./view";

export const dynamic = "force-dynamic";

export default async function AiFeedbackAdminPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/admin/ai-feedback");
  if (session.role !== "admin") redirect("/");

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

  const items = rows.map((r) => ({
    id: r.id,
    commentId: r.commentId,
    filePath: r.filePath,
    reporterName: r.reporterName ?? "(deleted)",
    verdict: r.verdict,
    reasonTag: r.reasonTag,
    note: r.note,
    aiBody: r.aiBody,
    aiSuggestion: r.aiSuggestion,
    aiOcrWrong: r.aiOcrWrong,
    videoTimeMs: r.videoTimeMs,
    createdAt: r.createdAt ? r.createdAt.getTime() : 0,
  }));

  return <AiFeedbackAdminView items={items} />;
}
