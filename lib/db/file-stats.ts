import { inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { comments } from "./schema";

export type FileStats = {
  commentCount: number;
  openCount: number;
};

// 주어진 파일 경로들에 대한 댓글 통계를 한 번에 조회
export async function getFileStats(
  paths: string[],
): Promise<Map<string, FileStats>> {
  const result = new Map<string, FileStats>();
  if (paths.length === 0) return result;

  // 전체 댓글 수 (최상위 + 답글 포함) / 미해결 피드백 수 (최상위만)
  const rows = await db
    .select({
      path: comments.filePath,
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${comments.kind} = 'feedback' and ${comments.resolvedAt} is null and ${comments.parentId} is null then 1 else 0 end)`,
    })
    .from(comments)
    .where(inArray(comments.filePath, paths))
    .groupBy(comments.filePath);

  for (const r of rows) {
    result.set(r.path, {
      commentCount: Number(r.total) || 0,
      openCount: Number(r.open) || 0,
    });
  }
  return result;
}
