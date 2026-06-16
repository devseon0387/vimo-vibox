import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { comments, clientVideos, shareLinks } from "@/lib/db/schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveAllowedPaths } from "@/lib/share/paths";

// 공유 링크 검증 helper
async function verifyShare(
  token: string,
  password: string,
): Promise<
  | { ok: true; link: typeof shareLinks.$inferSelect; allowedPaths: string[] }
  | { ok: false; status: number; error: string }
> {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  if (!link) return { ok: false, status: 404, error: "not found" };
  if (link.revokedAt) return { ok: false, status: 410, error: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410, error: "expired" };
  }
  if (link.passwordHash) {
    if (!password) return { ok: false, status: 401, error: "password required" };
    const m = await bcrypt.compare(password, link.passwordHash);
    if (!m) return { ok: false, status: 401, error: "wrong password" };
  }
  const allowedPaths = resolveAllowedPaths(link);
  return { ok: true, link, allowedPaths };
}

// GET /api/s/[token]/comments?p=/foo.mp4&password=...
// → 해당 파일의 게스트 가능 댓글 목록
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const p = url.searchParams.get("p");
  const password = url.searchParams.get("password") ?? "";

  const check = await verifyShare(token, password);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { link, allowedPaths } = check;
  const filePath = p && allowedPaths.includes(p) ? p : link.filePath;

  // 클라이언트 뷰에 보일 댓글:
  //  - visibility='client' (스태프가 공개로 전환한 것)
  //  - 이 공유 링크로 남긴 게스트 댓글 (shareToken 매칭)
  //  - link.includeFeedback 이면: 팀(게스트 아닌) 피드백도 함께 — 코멘트 visibility는 안 바꾸고
  //    이 링크에서만 드러냄(비파괴적·되돌릴 수 있음). "내가 남긴 피드백도 함께 보이기" 옵션의 핵심.
  // 순화본 대신 원문 body 사용 — 클라이언트는 본인이 쓴 글 그대로 보여야 함
  //
  // ── Phase 1 per-client 격리 ──
  // 같은 파일을 클라 A·B 두 공유 링크로 보냈을 때, A는 B 게스트의 코멘트를 못 봐야 한다.
  // 게스트 코멘트는 이미 shareToken 으로 분리되어 안전(아래 guest 조건).
  // 누출 지점은 visibility='client' 코멘트: file_path 단독이면 두 링크 모두에서 보임.
  // → 이 토큰을 통해 들어온(=share_token 일치) 'client' 코멘트 + 컨텍스트 없는 레거시('client'이면서
  //   share_token NULL = 마이그 이전 데이터·내부에서 수동 공개 전환)만 노출하도록 좁힌다.
  //   includeFeedback 의 팀 코멘트는 작성자가 매니저(특정 클라 소속 아님)라 file_path 로 유지.
  const clientVisible = and(
    eq(comments.visibility, "client"),
    or(
      eq(comments.shareToken, token),
      isNull(comments.shareToken), // 레거시/내부 공개 전환분 — 기존 동작 보존
    ),
  );
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.filePath, filePath),
        or(
          clientVisible,
          and(
            eq(comments.authorId, "guest"),
            eq(comments.shareToken, token),
          ),
          ...(link.includeFeedback ? [ne(comments.authorId, "guest")] : []),
        ),
      ),
    )
    .orderBy(asc(comments.videoTimeMs), asc(comments.createdAt));

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      authorId: r.authorId,
      authorName: r.authorName,
      guestName: r.guestName,
      videoTimeMs: r.videoTimeMs,
      category: r.category,
      autoCategory: r.autoCategory,
      kind: r.kind,
      autoKind: r.autoKind,
      annotation: r.annotation,
      body: r.body, // 원문 사용 (순화본 노출 X)
      parentId: r.parentId,
      resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
      resolvedBy: r.resolvedBy,
      createdAt: r.createdAt.getTime(),
    })),
  });
}

// POST /api/s/[token]/comments
// body: { path?, videoTimeMs?, body, guestName, password? }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  // 스팸 방어 — IP 기반 + 토큰 기반
  const ip = getClientIp(req);
  const ipLimit = rateLimit(`guestcomment:ip:${ip}`, {
    max: 20,
    windowMs: 60 * 1000,
  });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `너무 많은 요청. ${ipLimit.retryAfterSec}초 후 다시 시도` },
      { status: 429 },
    );
  }
  const tokenLimit = rateLimit(`guestcomment:token:${token}`, {
    max: 60,
    windowMs: 60 * 1000,
  });
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { error: `이 공유 링크에 너무 많은 댓글. ${tokenLimit.retryAfterSec}초 후 다시 시도` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.body || !body?.guestName) {
    return NextResponse.json({ error: "body, guestName required" }, { status: 400 });
  }

  const check = await verifyShare(token, String(body.password ?? ""));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }
  const { link, allowedPaths } = check;
  if (!link.allowComments) {
    return NextResponse.json({ error: "comments not allowed" }, { status: 403 });
  }

  const filePath =
    body.path && allowedPaths.includes(String(body.path))
      ? String(body.path)
      : link.filePath;

  const videoTimeMs =
    typeof body.videoTimeMs === "number" && body.videoTimeMs >= 0
      ? Math.floor(body.videoTimeMs)
      : 0;

  const guestName = String(body.guestName).trim().slice(0, 60);
  const text = String(body.body).trim().slice(0, 2000);
  if (!guestName || !text) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Phase 1 per-client 컨텍스트 채우기 (best-effort, nullable).
  // share_links 에는 client_id 가 없으므로(현재 클라 포털=토큰 단독), 파일이 client_videos 에
  // "정확히 한 클라"에만 등록돼 있으면 그 클라로 귀속한다. 여러 클라에 공유된 파일이면
  // 토큰만으로 클라를 단정할 수 없어 NULL 로 둔다(게스트 코멘트는 share_token 으로 이미 격리됨).
  // TODO(Phase 1.5): share_links 에 client_id(또는 client_video_id) 컬럼을 추가하고
  //   POST /api/shares 에서 채운 뒤, 여기서 link.clientId 를 우선 사용하도록 교체.
  let ctxClientId: string | null = null;
  let ctxShareClientId: string | null = null;
  try {
    const cvs = await db
      .select({ id: clientVideos.id, clientId: clientVideos.clientId })
      .from(clientVideos)
      .where(eq(clientVideos.filePath, filePath))
      .limit(2);
    if (cvs.length === 1) {
      ctxClientId = cvs[0].clientId;
      ctxShareClientId = cvs[0].id;
    }
  } catch {
    /* client_videos 컨텍스트 조회 실패 시 NULL 유지 (격리는 share_token 으로 보장) */
  }

  await db.insert(comments).values({
    id: randomUUID(),
    filePath,
    authorId: "guest", // 게스트 시스템 유저
    authorName: guestName,
    guestName,
    shareToken: token,
    clientId: ctxClientId,
    shareClientId: ctxShareClientId,
    videoTimeMs,
    category: "etc",
    autoCategory: "etc",
    kind: "feedback",
    autoKind: "feedback",
    body: text,
    // 게스트 피드백은 매니저 승인 대기 + 클라이언트 본인 뷰에는 자동 공개
    // (shareToken 매칭으로 자기 것 보임)
    visibility: "internal",
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}
