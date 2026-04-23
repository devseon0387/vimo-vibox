"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

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

  // 대소문자 구분 없이 검색
  const rows = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.username}) = ${username}`)
    .limit(1);

  const user = rows[0];
  if (!user) {
    return { error: "아이디 또는 비밀번호가 일치하지 않습니다" };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { error: "아이디 또는 비밀번호가 일치하지 않습니다" };
  }

  const token = await createSession({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });
  await setSessionCookie(token);

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const { clearSessionCookie } = await import("@/lib/auth/session");
  await clearSessionCookie();
  redirect("/login");
}
