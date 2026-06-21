import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import {
  detectCategory,
  detectKind,
  type Category,
  type Kind,
} from "@/lib/comments/detect";
import {
  isValidAnnotation,
  serializeAnnotation,
} from "@/lib/comments/annotation";

const VALID_CATEGORIES: Category[] = ["txt", "cut", "col", "aud", "mtn", "etc"];
const VALID_KINDS: Kind[] = ["feedback", "praise", "approve"];

// GET /api/comments?path=/foo.mp4 → 해당 파일의 댓글 (역할별 필터)
// admin/member: 전부 (모든 status + 원문 + 순화본 둘 다)
// partner: 승인된 것만 + 본인 작성 (순화본이 있으면 순화본)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rawPath = req.nextUrl.searchParams.get("path");
  if (!rawPath) return NextResponse.json({ error: "path required" }, { status: 400 });
  // 한글 NFC/NFD 정규화 — 브라우저 URL 은 NFD 로 오는 경우가 있어 DB(NFC) 와 매칭 실패.
  const filePath = rawPath.normalize("NFC");

  if (!(await canAccessFile(session, filePath))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isStaff = session.role === "admin" || session.role === "member";

  // 파트너는 pending 제외 (본인 댓글은 제외 대상 아님 — 어차피 본인 댓글은 기본 approved)
  const where = isStaff
    ? eq(comments.filePath, filePath)
    : and(
        eq(comments.filePath, filePath),
        or(
          eq(comments.status, "approved"),
          eq(comments.authorId, session.sub),
        ),
      );

  const rows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(asc(comments.videoTimeMs), asc(comments.createdAt));

  // 작성자 역할 lookup (멤버·매니저 vs 파트너 vs 게스트 시각적 구분용)
  const authorIds = Array.from(
    new Set(rows.map((r) => r.authorId).filter((id) => id && id !== "guest")),
  );
  const roleMap = new Map<string, "admin" | "member" | "partner">();
  if (authorIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, authorIds));
    for (const u of userRows) {
      roleMap.set(u.id, u.role);
    }
  }

  // pending 개수 (파트너에게 배너용으로 반환)
  let pendingCount = 0;
  if (!isStaff) {
    const pending = await db
      .select({ n: sql<number>`count(*)` })
      .from(comments)
      .where(and(eq(comments.filePath, filePath), eq(comments.status, "pending")));
    pendingCount = Number(pending[0]?.n ?? 0);
  }

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      authorId: r.authorId,
      authorName: r.authorName,
      authorRole:
        r.authorId === "guest"
          ? ("guest" as const)
          : (roleMap.get(r.authorId) ?? null),
      videoTimeMs: r.videoTimeMs,
      category: r.category,
      autoCategory: r.autoCategory,
      kind: r.kind,
      autoKind: r.autoKind,
      annotation: r.annotation,
      // 파트너는 순화본 있으면 순화본, 없으면 원문
      // admin/member는 원문 body + moderatedBody 둘 다 받음 (UI에서 둘 다 보여줌)
      body: isStaff ? r.body : (r.moderatedBody ?? r.body),
      moderatedBody: isStaff ? r.moderatedBody : null,
      visibility: r.visibility,
      status: r.status,
      approvedAt: r.approvedAt ? r.approvedAt.getTime() : null,
      approvedBy: r.approvedBy,
      guestName: r.guestName,
      parentId: r.parentId,
      resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
      resolvedBy: r.resolvedBy,
      createdAt: r.createdAt.getTime(),
    })),
    pendingCount,
  });
}

// POST /api/comments body: { path, videoTimeMs, body, category?, parentId? }
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.path || typeof body?.videoTimeMs !== "number" || !body?.body) {
    return NextResponse.json(
      { error: "path, videoTimeMs, body required" },
      { status: 400 },
    );
  }

  const filePath = String(body.path).normalize("NFC");
  if (!(await canAccessFile(session, filePath))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const text = String(body.body).trim();
  if (text.length === 0 || text.length > 2000) {
    return NextResponse.json({ error: "invalid body length" }, { status: 400 });
  }

  const autoCategory = detectCategory(text);
  const autoKind = detectKind(text);
  const userCat = body.category as Category | undefined;
  const userKind = body.kind as Kind | undefined;
  const category =
    userCat && VALID_CATEGORIES.includes(userCat) ? userCat : autoCategory;
  const kind =
    userKind && VALID_KINDS.includes(userKind) ? userKind : autoKind;

  // annotation 유효성 검사 + 직렬화
  let annotationStr: string | null = null;
  if (body.annotation) {
    if (!isValidAnnotation(body.annotation)) {
      return NextResponse.json({ error: "invalid annotation" }, { status: 400 });
    }
    annotationStr = serializeAnnotation(body.annotation);
  }

  await db.insert(comments).values({
    id: randomUUID(),
    filePath,
    authorId: session.sub,
    authorName: session.name ?? session.username,
    videoTimeMs: Math.max(0, Math.floor(Number(body.videoTimeMs))),
    category,
    autoCategory,
    kind,
    autoKind,
    annotation: annotationStr,
    body: text,
    parentId: body.parentId ? String(body.parentId) : null,
  });

  return NextResponse.json({ ok: true, autoCategory, category, autoKind, kind });
}
