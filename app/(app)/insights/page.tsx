import { desc, eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { InsightsView } from "@/components/InsightsView";
import type { Category } from "@/lib/comments/detect";

export const dynamic = "force-dynamic";

export type PraiseItem = {
  id: string;
  filePath: string;
  authorName: string;
  videoTimeMs: number;
  category: Category;
  body: string;
  createdAt: number;
};

export type FeedbackPatternRow = {
  category: Category;
  total: number;
  unresolved: number;
  recent: {
    id: string;
    filePath: string;
    authorName: string;
    videoTimeMs: number;
    body: string;
    createdAt: number;
    resolved: boolean;
  }[];
};

export type Stats = {
  total: number;
  praise: number;
  feedback: number;
  unresolved: number;
  resolved: number;
};

export default async function InsightsPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  // 전체 stats (top-level만)
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      praise: sql<number>`sum(case when ${comments.kind} = 'praise' then 1 else 0 end)`,
      feedback: sql<number>`sum(case when ${comments.kind} = 'feedback' then 1 else 0 end)`,
      unresolved: sql<number>`sum(case when ${comments.kind} = 'feedback' and ${comments.resolvedAt} is null then 1 else 0 end)`,
      resolved: sql<number>`sum(case when ${comments.resolvedAt} is not null then 1 else 0 end)`,
    })
    .from(comments)
    .where(isNull(comments.parentId));

  // 좋아요 모음 (최신 30개)
  const praiseRows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.kind, "praise"), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(30);

  const praiseItems: PraiseItem[] = praiseRows.map((r) => ({
    id: r.id,
    filePath: r.filePath,
    authorName: r.authorName,
    videoTimeMs: r.videoTimeMs,
    category: r.category as Category,
    body: r.body,
    createdAt: r.createdAt.getTime(),
  }));

  // 카테고리별 수정 패턴
  const categoryStats = await db
    .select({
      category: comments.category,
      total: sql<number>`count(*)`,
      unresolved: sql<number>`sum(case when ${comments.resolvedAt} is null then 1 else 0 end)`,
    })
    .from(comments)
    .where(and(eq(comments.kind, "feedback"), isNull(comments.parentId)))
    .groupBy(comments.category);

  // 각 카테고리별 최근 수정 예시 5개
  const patterns: FeedbackPatternRow[] = [];
  for (const cs of categoryStats) {
    const recent = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.kind, "feedback"),
          eq(comments.category, cs.category),
          isNull(comments.parentId),
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(5);
    patterns.push({
      category: cs.category as Category,
      total: Number(cs.total),
      unresolved: Number(cs.unresolved),
      recent: recent.map((r) => ({
        id: r.id,
        filePath: r.filePath,
        authorName: r.authorName,
        videoTimeMs: r.videoTimeMs,
        body: r.body,
        createdAt: r.createdAt.getTime(),
        resolved: !!r.resolvedAt,
      })),
    });
  }
  patterns.sort((a, b) => b.total - a.total);

  // 자동 감지 정확도 (학습 데이터 분석)
  const [detect] = await db
    .select({
      total: sql<number>`count(*)`,
      catMatch: sql<number>`sum(case when ${comments.category} = ${comments.autoCategory} then 1 else 0 end)`,
      kindMatch: sql<number>`sum(case when ${comments.kind} = ${comments.autoKind} then 1 else 0 end)`,
    })
    .from(comments);

  const stats2: Stats = {
    total: Number(stats?.total ?? 0),
    praise: Number(stats?.praise ?? 0),
    feedback: Number(stats?.feedback ?? 0),
    unresolved: Number(stats?.unresolved ?? 0),
    resolved: Number(stats?.resolved ?? 0),
  };

  const accuracy = {
    total: Number(detect?.total ?? 0),
    catMatch: Number(detect?.catMatch ?? 0),
    kindMatch: Number(detect?.kindMatch ?? 0),
  };

  // 사용하지 않는 임포트 억제
  void isNotNull;

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      <InsightsView
        stats={stats2}
        praise={praiseItems}
        patterns={patterns}
        accuracy={accuracy}
      />
    </div>
  );
}
