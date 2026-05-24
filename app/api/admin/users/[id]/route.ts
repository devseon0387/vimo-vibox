import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json({ error: "admin only" }, { status: 403 }),
    };
  }
  return { session };
}

// PATCH /api/admin/users/[id] — 이름/역할/할당량/비밀번호 변경
// body: { name?, role?, quotaGb?, password? }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const patch: Partial<typeof users.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.email === "string") patch.email = body.email.trim();
  if (body.role === "admin" || body.role === "member") {
    // 자기 자신 권한 강등 방지 (혼자 admin일 때 잠기는 상황)
    if (session!.sub === id && body.role !== "admin") {
      return NextResponse.json(
        { error: "자기 자신의 관리자 권한은 해제할 수 없어요" },
        { status: 400 },
      );
    }
    patch.role = body.role;
  }
  if (Number.isFinite(body.quotaGb)) {
    patch.quotaGb = Number(body.quotaGb);
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "password must be at least 6 chars" },
        { status: 400 },
      );
    }
    patch.passwordHash = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });
  }

  await db.update(users).set(patch).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id] — 사용자 비활성화 (soft delete)
// hard delete는 comments/trash/api_tokens 등 ON DELETE CASCADE로 모든 작업 이력 cascade
// 손실되어 위험. deactivatedAt 설정으로 로그인만 막고 데이터는 보존.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const { id } = await ctx.params;

  if (session!.sub === id) {
    return NextResponse.json(
      { error: "자기 자신은 삭제할 수 없어요" },
      { status: 400 },
    );
  }

  await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, id));
  return NextResponse.json({ ok: true, deactivated: true });
}
