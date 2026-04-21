import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
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
const VALID_KINDS: Kind[] = ["feedback", "praise"];

// GET /api/comments?path=/foo.mp4 → 해당 파일의 모든 댓글 (생성시각순)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "path required" }, { status: 400 });

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.filePath, filePath))
    .orderBy(asc(comments.videoTimeMs), asc(comments.createdAt));

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      authorId: r.authorId,
      authorName: r.authorName,
      videoTimeMs: r.videoTimeMs,
      category: r.category,
      autoCategory: r.autoCategory,
      kind: r.kind,
      autoKind: r.autoKind,
      annotation: r.annotation,
      body: r.body,
      parentId: r.parentId,
      resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
      resolvedBy: r.resolvedBy,
      createdAt: r.createdAt.getTime(),
    })),
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
    filePath: String(body.path),
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
