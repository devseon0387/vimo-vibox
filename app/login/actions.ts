"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { loginViaSupabase } from "@/lib/auth/supabase-bridge";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "아이디와 비밀번호를 입력하세요" };
  }

  // IP 기반 + 아이디 기반 레이트 리밋 (둘 다 체크해 계정 타게팅도 차단)
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const ipLimit = rateLimit(`login:ip:${ip}`, {
    max: 10,
    windowMs: 5 * 60 * 1000,
  });
  if (!ipLimit.ok) {
    return {
      error: `로그인 시도가 너무 많습니다. ${ipLimit.retryAfterSec}초 후 다시 시도하세요`,
    };
  }
  const userLimit = rateLimit(`login:user:${username}`, {
    max: 5,
    windowMs: 5 * 60 * 1000,
  });
  if (!userLimit.ok) {
    return {
      error: `이 계정은 잠시 로그인 제한됐습니다. ${userLimit.retryAfterSec}초 후 다시 시도하세요`,
    };
  }

  // 1) 자체 SQLite users 매칭 (username 또는 email 둘 다 허용, 대소문자 무시)
  const rows = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.username}) = ${username} OR LOWER(${users.email}) = ${username}`)
    .limit(1);

  // timing 균일화 — 사용자 미존재 시에도 bcrypt 호출 (enumeration 차단)
  const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuV1cKQjZ7ZSf6N3D8XWvLpVqVqJxOAaW";
  const local = rows[0];
  const isExternalSso = local?.passwordHash === "external-sso";
  const hash = local && !isExternalSso ? local.passwordHash : DUMMY_HASH;
  const localOk = await bcrypt.compare(password, hash);

  if (local && localOk && !isExternalSso) {
    // 비활성화(soft-delete) 계정은 로그인 차단 (schema: deactivatedAt 주석 참조)
    if (local.deactivatedAt) {
      return { error: "비활성화된 계정입니다. 관리자에게 문의하세요" };
    }
    const token = await createSession({
      sub: local.id,
      username: local.username,
      name: local.name,
      role: local.role,
    });
    await setSessionCookie(token);
    redirect("/");
  }

  // 2) 자체 PW 매칭 실패 또는 SSO 전용 계정 — Supabase 로 비밀번호 검증 위임
  //    입력이 이메일 형식일 때만 시도 (아이디 enumeration 노출 최소화)
  if (username.includes("@")) {
    const sb = await loginViaSupabase(username, password);
    if (sb.ok) {
      const namespacedId = `erp:${sb.sub}`;
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.id, namespacedId))
        .limit(1);

      if (existing.length === 0) {
        const baseUsername = (sb.email.split("@")[0] || "user")
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "");
        await db.insert(users).values({
          id: namespacedId,
          username: `${baseUsername}-${sb.sub.slice(0, 6)}`,
          email: sb.email,
          name: sb.name,
          passwordHash: "external-sso",
          role: sb.role,
          quotaGb: 100,
        });
      } else {
        const u = existing[0];
        // vibox 에서 비활성화한 ERP 계정은 Supabase 인증이 통과해도 차단
        if (u.deactivatedAt) {
          return { error: "비활성화된 계정입니다. 관리자에게 문의하세요" };
        }
        if (u.email !== sb.email || u.name !== sb.name || u.role !== sb.role) {
          await db
            .update(users)
            .set({ email: sb.email, name: sb.name, role: sb.role })
            .where(eq(users.id, namespacedId));
        }
      }

      const token = await createSession({
        sub: namespacedId,
        username: sb.email,
        name: sb.name,
        role: sb.role,
      });
      await setSessionCookie(token);
      redirect("/");
    }

    if (sb.reason === "no_vibox_access") {
      return { error: "비박스 사용 권한이 없는 계정입니다. 관리자에게 문의하세요" };
    }
  }

  return { error: "아이디 또는 비밀번호가 일치하지 않습니다" };
}

export async function logoutAction(): Promise<void> {
  const { clearSessionCookie } = await import("@/lib/auth/session");
  await clearSessionCookie();
  redirect("/login");
}
