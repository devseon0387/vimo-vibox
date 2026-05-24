import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";

const SESSION_COOKIE = "vimo_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET too short (min 32 chars) — generate with: openssl rand -hex 32");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  username: string;
  name: string | null;
  role: "admin" | "member" | "partner";
};

export async function createSession(
  payload: SessionPayload,
  maxAgeSec: number = SESSION_MAX_AGE,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(getSecret());
}

/** 데스크탑 앱용 7일 토큰. Keychain 탈취 시 노출 시간 단축. */
export const DESKTOP_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** 서버 컴포넌트·서버 액션·API 라우트에서 사용. cookie 우선, Bearer 토큰 fallback (데스크탑 앱). */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const cookieToken = store.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const sess = await verifySession(cookieToken);
    if (sess) return sess;
  }
  // Bearer 토큰 (데스크탑 앱이 Authorization 헤더로 전송)
  try {
    const h = await headers();
    const auth = h.get("authorization") ?? h.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const bearerToken = auth.slice(7).trim();
      if (bearerToken) return await verifySession(bearerToken);
    }
  } catch {
    // headers() may not be available in all contexts
  }
  return null;
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
    // CSRF 방어 강화: 동일 사이트 내 요청에만 전송
    // 크로스 오리진 POST가 진짜 필요해지면 "none"으로 올리되 secure 필수
    sameSite: "lax",
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
