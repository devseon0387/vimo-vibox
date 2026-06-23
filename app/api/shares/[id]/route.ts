import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shareLinks } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessFile } from "@/lib/auth/access";
import { statPath } from "@/lib/fs/storage";

// DELETE /api/shares/[id]  → 내 공유 링크 리보크 (soft delete — audit 추적용으로 row 유지)
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const isAdmin = session.role === "admin";
  const where = isAdmin
    ? eq(shareLinks.id, id)
    : and(eq(shareLinks.id, id), eq(shareLinks.createdBy, session.sub));

  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(where);

  return NextResponse.json({ ok: true });
}

// PATCH /api/shares/[id]
// body: {
//   addPaths?: string[],     // 버전 추가 (paths 끝에 append)
//   removePaths?: string[],  // 특정 파일 제거 (primary 제거 시 첫 남은 것으로 승격)
// }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [existing] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.createdBy, session.sub)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const addPaths: string[] = Array.isArray(body.addPaths)
    ? body.addPaths.map(String).filter(Boolean)
    : [];
  const removePaths: string[] = Array.isArray(body.removePaths)
    ? body.removePaths.map(String).filter(Boolean)
    : [];

  // 모드·다운로드·댓글 변경 (업로드 직후 공유 패널의 토글) — URL(token)은 유지
  const setValues: {
    mode?: "preview" | "full";
    allowComments?: boolean;
    allowDownload?: boolean;
    filePath?: string;
    paths?: string | null;
  } = {};
  if (body.mode === "preview" || body.mode === "full") {
    setValues.mode = body.mode;
    // 명시 없으면 full=댓글 허용, preview=댓글 끔
    setValues.allowComments =
      typeof body.allowComments === "boolean"
        ? body.allowComments
        : body.mode === "full";
  } else if (typeof body.allowComments === "boolean") {
    setValues.allowComments = body.allowComments;
  }
  if (typeof body.allowDownload === "boolean") {
    setValues.allowDownload = body.allowDownload;
  }

  const hasPathChange = addPaths.length > 0 || removePaths.length > 0;
  const hasFieldChange = Object.keys(setValues).length > 0;
  if (!hasPathChange && !hasFieldChange) {
    return NextResponse.json({ error: "nothing to change" }, { status: 400 });
  }

  let resultPaths: string[] = existing.paths
    ? (JSON.parse(existing.paths) as string[])
    : [existing.filePath];

  if (hasPathChange) {
    // 추가 대상 접근 권한 확인
    for (const p of addPaths) {
      if (!(await canAccessFile(session, p))) {
        return NextResponse.json({ error: `접근 불가: ${p}` }, { status: 403 });
      }
    }
    // 추가 대상 파일 존재 확인
    for (const p of addPaths) {
      try {
        const { stat } = await statPath(p);
        if (stat.isDirectory()) {
          return NextResponse.json(
            { error: `폴더는 추가할 수 없어요: ${p}` },
            { status: 400 },
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "unknown";
        return NextResponse.json({ error: `${p}: ${msg}` }, { status: 400 });
      }
    }
    // 기존에 없는 것만 추가 (중복 방지)
    const afterAdd = [
      ...resultPaths,
      ...addPaths.filter((p) => !resultPaths.includes(p)),
    ];
    const afterRemove = afterAdd.filter((p) => !removePaths.includes(p));
    if (afterRemove.length === 0) {
      return NextResponse.json(
        { error: "최소 1개 파일은 남겨야 해요" },
        { status: 400 },
      );
    }
    resultPaths = afterRemove;
    setValues.filePath = afterRemove[0]; // primaryPath (backward compat)
    setValues.paths = afterRemove.length > 1 ? JSON.stringify(afterRemove) : null;
  }

  await db.update(shareLinks).set(setValues).where(eq(shareLinks.id, id));

  return NextResponse.json({
    ok: true,
    paths: resultPaths,
    filePath: setValues.filePath ?? existing.filePath,
    mode: setValues.mode ?? existing.mode,
    allowComments: setValues.allowComments ?? existing.allowComments,
    allowDownload: setValues.allowDownload ?? existing.allowDownload,
  });
}
