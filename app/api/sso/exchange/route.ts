/**
 * POST /api/sso/exchange
 *
 * 파트너 ERP에서 발급한 단기 JWT를 받아 vibox 세션으로 교환.
 * - HMAC 검증 (VIBOX_SSO_SECRET)
 * - users 테이블 upsert (Supabase user.id 기준)
 * - vimo_session 쿠키 발급
 *
 * Body: { token: string }
 * Response: { ok: true, user: { id, name, role } }
 */
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { verifySsoToken } from "@/lib/auth/sso";
import { corsHeaders, preflight } from "@/lib/auth/cors";

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  const body = await req.json().catch(() => null);
  const token = body && typeof body.token === "string" ? body.token : null;
  if (!token) {
    return Response.json({ error: "missing token" }, { status: 400, headers: cors });
  }

  const payload = await verifySsoToken(token);
  if (!payload) {
    return Response.json({ error: "invalid or expired token" }, { status: 401, headers: cors });
  }

  // users upsert — ERP의 sub와 vibox-네이티브 users.id 충돌 시 admin 권한 덮어쓰기 방지를 위해
  // SSO 사용자는 "erp:" 네임스페이스로 분리. 기존 ERP 사용자(prefix 없는 id)와의 호환을 위해
  // 먼저 namespaced id 찾고, 없으면 raw id 폴백 (마이그레이션 기간 동안만 후자 허용)
  const namespacedId = `erp:${payload.sub}`;
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, namespacedId))
    .limit(1);

  if (existing.length === 0) {
    // 같은 raw sub로 vibox-네이티브 admin이 등록돼있을 가능성 사전 차단
    const collision = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (collision.length > 0) {
      console.warn(
        `[sso] sub 충돌 — namespaced로 분리 생성. raw_id=${payload.sub} raw_role=${collision[0].role}`,
      );
    }
    const baseUsername = (payload.email.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");
    const username = `${baseUsername}-${payload.sub.slice(0, 6)}`;
    await db.insert(users).values({
      id: namespacedId,
      username,
      email: payload.email,
      name: payload.name,
      passwordHash: "external-sso",
      role: payload.role,
      quotaGb: 100,
    });
  } else {
    const u = existing[0];
    if (
      u.email !== payload.email ||
      u.name !== payload.name ||
      u.role !== payload.role
    ) {
      await db
        .update(users)
        .set({
          email: payload.email,
          name: payload.name,
          role: payload.role,
        })
        .where(eq(users.id, namespacedId));
    }
  }

  const session = await createSession({
    sub: namespacedId,
    username: payload.email,
    name: payload.name,
    role: payload.role,
  });
  await setSessionCookie(session);

  return Response.json(
    {
      ok: true,
      user: {
        id: namespacedId,
        name: payload.name,
        role: payload.role,
      },
    },
    { headers: cors }
  );
}

export const runtime = "nodejs";
