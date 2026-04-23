import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, fileUploads, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

// GET /api/my/stats?days=30
// 본인 업로드 파일에 받은 피드백·칭찬 집계 + 전기간 대비.
// 파트너가 자기 성장 지표 확인용. staff/admin 은 필요 시 나중에 별도 뷰.
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam && Number.isFinite(parseInt(daysParam, 10))
    ? Math.max(7, Math.min(180, parseInt(daysParam, 10)))
    : 30;

  const now = Date.now();
  const curFrom = new Date(now - days * 24 * 60 * 60 * 1000);
  const curTo = new Date(now);
  const prevFrom = new Date(now - 2 * days * 24 * 60 * 60 * 1000);
  const prevTo = curFrom;

  // 내가 업로드한 파일 경로들
  const myFiles = await db
    .select({ path: fileUploads.path, uploadedAt: fileUploads.uploadedAt })
    .from(fileUploads)
    .where(eq(fileUploads.uploadedBy, session.sub));
  const allMyPaths = myFiles.map((f) => f.path);

  // 업로드 수 (현재/이전 기간)
  const uploadsCur = myFiles.filter(
    (f) => f.uploadedAt >= curFrom && f.uploadedAt < curTo,
  ).length;
  const uploadsPrev = myFiles.filter(
    (f) => f.uploadedAt >= prevFrom && f.uploadedAt < prevTo,
  ).length;

  // 내 파일에 달린 댓글 집계
  const myComments = allMyPaths.length > 0
    ? await db
        .select()
        .from(comments)
        .where(
          and(
            inArray(comments.filePath, allMyPaths),
            gte(comments.createdAt, prevFrom),
          ),
        )
    : [];

  const cur = myComments.filter((c) => c.createdAt >= curFrom);
  const prev = myComments.filter(
    (c) => c.createdAt >= prevFrom && c.createdAt < prevTo,
  );

  // 수정요청/칭찬 분리 (parent 만 카운트, 답글은 제외)
  const curFeedback = cur.filter((c) => !c.parentId && c.kind === "feedback");
  const curPraise = cur.filter((c) => !c.parentId && c.kind === "praise");
  const prevFeedback = prev.filter((c) => !c.parentId && c.kind === "feedback");
  const prevPraise = prev.filter((c) => !c.parentId && c.kind === "praise");

  const curResolved = curFeedback.filter((c) => c.resolvedAt !== null).length;
  const prevResolved = prevFeedback.filter((c) => c.resolvedAt !== null).length;

  // 카테고리별 집계
  const CATEGORIES = ["txt", "cut", "col", "aud", "mtn", "etc"] as const;
  const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
    txt: "자막 오타",
    cut: "컷 타이밍",
    col: "색감 조정",
    aud: "오디오",
    mtn: "동작",
    etc: "기타",
  };

  const catCounts = CATEGORIES.map((cat) => {
    const c = curFeedback.filter((x) => x.category === cat).length;
    const p = prevFeedback.filter((x) => x.category === cat).length;
    return { category: cat, label: CATEGORY_LABELS[cat], count: c, prev: p };
  });

  // 칭찬 리스트 (최근 10건) + 작성자 이름
  const praiseRows = curPraise
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);
  const authorIds = Array.from(new Set(praiseRows.map((p) => p.authorId)));
  const authors = authorIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(inArray(users.id, authorIds))
    : [];
  const authorById = new Map(
    authors.map((a) => [a.id, a.name ?? a.username ?? ""]),
  );
  const praiseList = praiseRows.map((p) => ({
    body: p.body,
    filePath: p.filePath,
    createdAt: p.createdAt.getTime(),
    fromName: authorById.get(p.authorId) ?? p.authorName ?? "",
  }));

  // 반복 지적 감지: 피드백 body 에서 특정 키워드 빈도 스캔
  const REPEAT_KEYWORDS = [
    "띄어쓰기",
    "오타",
    "맞춤법",
    "자막",
    "색감",
    "볼륨",
    "싱크",
  ];
  let repeatWarning: { keyword: string; count: number } | null = null;
  for (const kw of REPEAT_KEYWORDS) {
    const n = curFeedback.filter((c) => c.body.includes(kw)).length;
    if (n >= 5 && (!repeatWarning || n > repeatWarning.count)) {
      repeatWarning = { keyword: kw, count: n };
    }
  }

  return NextResponse.json({
    period: { from: curFrom.getTime(), to: curTo.getTime(), days },
    kpi: {
      uploads: uploadsCur,
      uploadsPrev,
      feedback: curFeedback.length,
      feedbackPrev: prevFeedback.length,
      resolved: curResolved,
      resolvedRate: curFeedback.length > 0 ? curResolved / curFeedback.length : 0,
      resolvedRatePrev:
        prevFeedback.length > 0 ? prevResolved / prevFeedback.length : 0,
      praise: curPraise.length,
      praisePrev: prevPraise.length,
    },
    categories: catCounts,
    praiseList,
    repeatWarning,
  });
}

export const runtime = "nodejs";
