import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "vimo_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  username: string;
  name: string | null;
  role: "admin" | "member" | "partner";
};

export async function createSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** 서버 컴포넌트·서버 액션에서 사용 */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifySession(token);
}

type CookieOpts = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAge: number;
  path: string;
  domain?: string;
};

function cookieOpts(maxAge: number): CookieOpts {
  const isProd = process.env.NODE_ENV === "production";
  const opts: CookieOpts = {
    httpOnly: true,
    secure: isProd,
    // 프로덕션: 서브도메인 샤딩 cross-origin POST에서도 쿠키 전송 보장
    sameSite: isProd ? "none" : "lax",
    maxAge,
    path: "/",
  };
  if (process.env.COOKIE_DOMAIN) {
    opts.domain = process.env.COOKIE_DOMAIN;
  }
  return opts;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOpts(SESSION_MAX_AGE));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // maxAge 0으로 즉시 만료 (domain 포함)
  store.set(SESSION_COOKIE, "", cookieOpts(0));
}

export { SESSION_COOKIE };
