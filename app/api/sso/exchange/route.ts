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
import { verifySsoToken, type SsoPayload } from "@/lib/auth/sso";
import { corsHeaders, preflight } from "@/lib/auth/cors";

/**
 * users upsert — ERP의 sub와 vibox-네이티브 users.id 충돌 시 admin 권한 덮어쓰기
 * 방지를 위해 SSO 사용자는 "erp:" 네임스페이스로 분리.
 */
async function upsertSsoUser(
  payload: SsoPayload,
): Promise<{ id: string; deactivated: boolean }> {
  const namespacedId = `erp:${payload.sub}`;
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, namespacedId))
    .limit(1);

  if (existing.length === 0) {
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
    return { id: namespacedId, deactivated: false };
  }

  const u = existing[0];
  // vibox 에서 비활성화(soft-delete)한 계정은 외부 ERP SSO 로도 재진입 차단
  if (u.deactivatedAt) {
    return { id: namespacedId, deactivated: true };
  }
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
  return { id: namespacedId, deactivated: false };
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * GET /api/sso/exchange?token=xxx&redirect=/
 *
 * 외부 ERP에서 top-level GET 네비게이션으로 호출. SameSite=Lax / 3rd-party
 * cookie 차단 환경에서도 destination 도메인(vibox.cloud) 의 first-party 응답이라
 * 쿠키 설정이 안정적. 토큰은 5초 만료·일회용이라 URL 노출 허용.
 *
 * 응답: 성공 → 302 to redirect (기본 '/'), 실패 → 302 to /login?sso_error=...
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const dest = url.searchParams.get("redirect") || "/";
  // open redirect 방지: 상대경로만 허용
  const safeDest = dest.startsWith("/") && !dest.startsWith("//") ? dest : "/";

  if (!token) {
    return Response.redirect(new URL(`/login?sso_error=missing_token`, req.url), 302);
  }

  const payload = await verifySsoToken(token);
  if (!payload) {
    return Response.redirect(new URL(`/login?sso_error=invalid_token`, req.url), 302);
  }

  const { deactivated } = await upsertSsoUser(payload);
  if (deactivated) {
    return Response.redirect(new URL(`/login?sso_error=deactivated`, req.url), 302);
  }

  const session = await createSession({
    sub: `erp:${payload.sub}`,
    username: payload.email,
    name: payload.name,
    role: payload.role,
  });
  await setSessionCookie(session);

  return Response.redirect(new URL(safeDest, req.url), 302);
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

  const { id: namespacedId, deactivated } = await upsertSsoUser(payload);
  if (deactivated) {
    return Response.json(
      { error: "비활성화된 계정입니다" },
      { status: 403, headers: cors },
    );
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
