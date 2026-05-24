// Vibox Desktop 앱 전용 로그인 endpoint
// POST /api/desktop/login { username, password } → { token, user }
// 데스크탑 앱이 토큰을 macOS Keychain에 저장하고 Bearer 헤더로 청크 업로드.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, DESKTOP_TOKEN_MAX_AGE, type SessionPayload } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // rate limit (per-IP)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const limit = rateLimit(`desktop-login:ip:${ip}`, {
    max: 10,
    windowMs: 5 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: `너무 많이 시도했어요. ${limit.retryAfterSec}초 후 다시 시도하세요` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "아이디·비밀번호 필요" }, { status: 400 });
  }

  const username = String(body.username).trim().toLowerCase();
  const password = String(body.password);

  const userLimit = rateLimit(`desktop-login:user:${username}`, {
    max: 5,
    windowMs: 5 * 60 * 1000,
  });
  if (!userLimit.ok) {
    return NextResponse.json(
      { error: `이 계정은 잠시 제한됐어요. ${userLimit.retryAfterSec}초 후 다시` },
      { status: 429 },
    );
  }

  const found = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);

  if (found.length === 0) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 틀렸습니다" }, { status: 401 });
  }
  const user = found[0];

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 틀렸습니다" }, { status: 401 });
  }

  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role as SessionPayload["role"],
  };
  const token = await createSession(payload, DESKTOP_TOKEN_MAX_AGE);

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  });
}
