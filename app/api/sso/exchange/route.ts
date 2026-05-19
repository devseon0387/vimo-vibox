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

  // users upsert — Supabase id 기준
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (existing.length === 0) {
    // 신규 가입 — username은 email 기반 자동 생성 (충돌 방지 위해 sub 일부 추가)
    const baseUsername = (payload.email.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");
    const username = `${baseUsername}-${payload.sub.slice(0, 6)}`;
    await db.insert(users).values({
      id: payload.sub,
      username,
      email: payload.email,
      name: payload.name,
      // 외부 SSO 사용자는 비번 미사용 — 빈 hash 저장
      passwordHash: "external-sso",
      role: payload.role,
      quotaGb: 100,
    });
  } else {
    // 메타 동기화 (이름/이메일/역할이 바뀌었을 수 있음)
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
        .where(eq(users.id, payload.sub));
    }
  }

  const session = await createSession({
    sub: payload.sub,
    username: payload.email,
    name: payload.name,
    role: payload.role,
  });
  await setSessionCookie(session);

  return Response.json(
    {
      ok: true,
      user: {
        id: payload.sub,
        name: payload.name,
        role: payload.role,
      },
    },
    { headers: cors }
  );
}

export const runtime = "nodejs";
