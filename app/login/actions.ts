"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";

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
