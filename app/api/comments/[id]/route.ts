import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, fileUploads, shareLinks, clientVideos } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { isPathInShare } from "@/lib/share/paths";
import type { Category, Kind } from "@/lib/comments/detect";

const VALID_CATEGORIES: Category[] = ["txt", "cut", "col", "aud", "mtn", "etc"];
// kind 토글로 변경 가능한 값은 feedback/praise 뿐. 'approve'(버전 승인)는 생성 시점에만 부여되는
// 합성 kind라, PATCH 로 일반 코멘트를 approve 로 재분류하는 건 의도적으로 제외한다(승인은 body.approve 경로).
const VALID_KINDS: Kind[] = ["feedback", "praise"];

// PATCH /api/comments/[id]
// body: { category?, body?, resolved?: boolean }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // 권한 분기용 플래그
  const isStaff = session.role === "admin" || session.role === "member";
  const isAuthor = existing.authorId === session.sub;
  // 파일 소유자 (파트너가 본인 업로드 파일의 피드백에 대해 권한 가짐)
  let isFileOwner = false;
  if (!isStaff && !isAuthor && session.role === "partner") {
    const [ownerRow] = await db
      .select({ uploadedBy: fileUploads.uploadedBy })
      .from(fileUploads)
      .where(eq(fileUploads.path, existing.filePath))
      .limit(1);
    isFileOwner = ownerRow?.uploadedBy === session.sub;
  }

  const patch: Partial<typeof comments.$inferInsert> = {};

  if (body.category !== undefined) {
    // 분류는 staff 또는 작성자만 변경 가능 (타인이 임의로 왜곡 방지)
    if (!isStaff && !isAuthor) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    patch.category = body.category;
  }

  if (body.kind !== undefined) {
    // 종류(feedback/praise)도 staff 또는 작성자만
    if (!isStaff && !isAuthor) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!VALID_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    patch.kind = body.kind;
  }

  if (typeof body.body === "string") {
    // 본문 편집은 작성자만
    if (!isAuthor) {
      return NextResponse.json({ error: "작성자만 편집할 수 있어요" }, { status: 403 });
    }
    const text = body.body.trim();
    if (text.length === 0 || text.length > 2000) {
      return NextResponse.json({ error: "invalid body length" }, { status: 400 });
    }
    patch.body = text;
  }

  if (typeof body.resolved === "boolean") {
    // 해결 마크: staff / 작성자 / 파일 소유자(파트너가 자기 작업물 피드백에 대해)
    if (!isStaff && !isAuthor && !isFileOwner) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (body.resolved) {
      patch.resolvedAt = new Date();
      patch.resolvedBy = session.sub;
    } else {
      patch.resolvedAt = null;
      patch.resolvedBy = null;
    }
  }

  // 가시성/승인 — admin/member만
  if (body.visibility !== undefined) {
    if (!isStaff) {
      return NextResponse.json({ error: "staff only" }, { status: 403 });
    }
    if (body.visibility !== "internal" && body.visibility !== "client") {
      return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
    }
    patch.visibility = body.visibility;

    // Phase 1.5 (Option A): client 공개 시 "특정 공유 링크"에 귀속.
    // body.shareToken(선택) 전달 시 그 링크가 이 파일을 포함하는지 검증 후 share_token 을 채워,
    // 게스트 뷰(/api/s/[token]/comments)에서 해당 링크에서만 이 client 코멘트가 보이게 한다.
    // 미전달 시 아무것도 안 함(무회귀 — 기존 동작 그대로 visibility 만 전환).
    if (body.visibility === "client" && typeof body.shareToken === "string" && body.shareToken) {
      // 보안 경계: 본인이 만든 링크(createdBy)만 귀속 허용. PATCH 는 임의 토큰을 받는
      // 인증 경로라 프론트의 "내 링크만 후보" 제약은 보안 경계가 아니다 → 서버에서 소유권 강제.
      // (존재하나 내 것이 아닌 토큰도 동일 400 — 타인 링크 존재 여부를 흘리지 않음)
      const [link] = await db
        .select()
        .from(shareLinks)
        .where(and(eq(shareLinks.token, body.shareToken), eq(shareLinks.createdBy, session.sub)))
        .limit(1);
      if (!link) {
        return NextResponse.json({ error: "공유 링크를 찾을 수 없어요" }, { status: 400 });
      }
      // 죽은 링크(취소/만료)에 귀속 방지 — 게스트 뷰는 어차피 410 으로 막히지만
      // "공개됨" 토스트만 뜨고 실제론 안 보이는 혼란을 차단.
      if (link.revokedAt || (link.expiresAt && link.expiresAt.getTime() <= Date.now())) {
        return NextResponse.json({ error: "취소되었거나 만료된 링크예요" }, { status: 400 });
      }
      if (!isPathInShare(link, existing.filePath)) {
        return NextResponse.json(
          { error: "이 링크는 이 파일을 포함하지 않아요" },
          { status: 400 },
        );
      }
      patch.shareToken = body.shareToken;

      // client_id / share_client_id 동반 set (best-effort, nullable).
      // 게스트 POST(/api/s/[token]/comments) 의 로직 재사용: 파일이 client_videos 에 정확히 한
      // 클라에만 등록돼 있으면 그 클라로 귀속, 아니면 NULL 유지(격리는 share_token 으로 보장).
      try {
        const cvs = await db
          .select({ id: clientVideos.id, clientId: clientVideos.clientId })
          .from(clientVideos)
          .where(eq(clientVideos.filePath, existing.filePath))
          .limit(2);
        if (cvs.length === 1) {
          patch.clientId = cvs[0].clientId;
          patch.shareClientId = cvs[0].id;
        }
      } catch {
        /* client_videos 컨텍스트 조회 실패 시 NULL 유지 */
      }
    }
    // TODO(Phase 1.5): visibility='internal' 로 되돌릴 때 기존 share_token 을 비울지는 미정.
    //   프롬프트에 명시 없으므로 현 무회귀 유지(그대로 둠). internal 코멘트는 게스트 뷰의
    //   clientVisible 조건(visibility='client' AND share_token=token)에 걸리지 않아 노출 안 됨(안전).
  }

  if (body.approve === true) {
    if (!isStaff) {
      return NextResponse.json({ error: "staff only" }, { status: 403 });
    }
    patch.status = "approved";
    patch.approvedAt = new Date();
    patch.approvedBy = session.sub;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });
  }

  await db.update(comments).set(patch).where(eq(comments.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/comments/[id] — 작성자 또는 관리자만
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.authorId !== session.sub && session.role !== "admin") {
    return NextResponse.json({ error: "작성자 또는 관리자만 삭제할 수 있어요" }, { status: 403 });
  }

  // 답글 + 본 댓글을 단일 트랜잭션으로 (서버 죽으면 둘 다 롤백)
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(eq(comments.parentId, id));
    await tx.delete(comments).where(eq(comments.id, id));
  });

  return NextResponse.json({ ok: true });
}
