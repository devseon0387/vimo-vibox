import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, or } from "drizzle-orm";
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
  //  - visibility='client' 이면서 "이 공유 링크(토큰)에 속한" 것만 (share_token = 현재 token)
  //  - 이 공유 링크로 남긴 게스트 댓글 (shareToken 매칭)
  //  - link.includeFeedback 이면: 팀(게스트 아닌) 피드백도 함께 — 코멘트 visibility는 안 바꾸고
  //    이 링크에서만 드러냄(비파괴적·되돌릴 수 있음). "내가 남긴 피드백도 함께 보이기" 옵션의 핵심.
  // 순화본 대신 원문 body 사용 — 클라이언트는 본인이 쓴 글 그대로 보여야 함
  //
  // ── Phase 1 per-link 격리 (결정#1: "가린다") ──
  // 격리 단위 = 공유 링크(토큰). 같은 파일을 클라 A·B 두 공유 링크로 보냈을 때,
  // A 링크 뷰에는 A 토큰에 속한 코멘트만 보여야 한다.
  // 게스트 코멘트는 이미 shareToken 으로 분리되어 안전(아래 guest 조건).
  // 누출 지점은 visibility='client' 코멘트였다: 기존엔 file_path 단독 + share_token NULL 브로드캐스트
  // 분기가 있어, 토큰 없는(또는 다른 토큰의) client 코멘트가 file_path 만으로 모든 링크에 노출됐다.
  // → 그 브로드캐스트 분기(isNull(shareToken) / file_path 단독)를 제거하고,
  //   client 코멘트는 share_token = 현재 token 일치만 노출하도록 좁혀 누수를 닫는다.
  //
  // ⚠️ FLAG (manager-reply): 현재 코드에 "매니저가 특정 공유 링크 맥락에서 client 코멘트를 다는"
  //   경로가 없다. visibility='client' 로 만드는 유일한 경로는 PATCH /api/comments/[id] 인데,
  //   거기서는 visibility 만 바꾸고 share_token 을 붙이지 않는다(스태프 작성 코멘트의 share_token 은
  //   POST /api/comments 에서 설정되지 않아 NULL 로 남는다). 따라서 이 스코핑 적용 후,
  //   매니저가 공개로 전환한(=토큰 없는) client 코멘트는 어느 링크 뷰에도 보이지 않게 된다.
  //   → 별도 보완 필요: 매니저가 "링크 맥락"에서 코멘트를 달거나 공개 전환 시 share_token 을
  //     채울 수 있는 UI/흐름. 자세한 TODO 는 아래 참고. (게스트→client 승격분은 원래 토큰이
  //     붙어 있어 정상 노출되며, 내부/팀 뷰 /api/comments 는 영향 없음.)
  // TODO(Phase 1.5): visibility='client' 전환 경로(PATCH /api/comments/[id])나
  //   매니저 공유링크 코멘트 작성 흐름에서 대상 share_token(또는 client 컨텍스트)을 받아
  //   comments.share_token 을 채운다. 그 전까지 매니저 client 코멘트는 클라에게 노출되지 않음.
  const clientVisible = and(
    eq(comments.visibility, "client"),
    eq(comments.shareToken, token), // 누수 차단: 이 토큰에 속한 client 코멘트만
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
          // includeFeedback: 클라에게 팀 피드백도 보여주는 옵션. 단, visibility='internal'
          // 스태프 노트가 새지 않도록 visibility='client'(클라 공개)인 팀 코멘트만 노출한다.
          // (게스트 아님 AND 클라 공개) — includeFeedback 의 의도는 visibility='client' 로 보존.
          // TODO(Phase 1.5): 토큰 단위 격리 일관성상 이 분기도 share_token=token 으로 좁혀야 하나,
          //   스태프 작성 팀 코멘트에는 아직 share_token 이 채워지지 않는다(매니저-코멘트-토큰 갭,
          //   POST /api/comments 가 share_token 미설정). 지금 token 까지 강제하면 includeFeedback 이
          //   아무것도 못 보여주므로, 이번엔 internal 누수 차단(visibility=client)만 적용한다.
          //   share_token 채우기 흐름이 생기면 여기에 eq(comments.shareToken, token) 을 AND 로 추가.
          ...(link.includeFeedback
            ? [
                and(
                  ne(comments.authorId, "guest"),
                  eq(comments.visibility, "client"),
                ),
              ]
            : []),
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
