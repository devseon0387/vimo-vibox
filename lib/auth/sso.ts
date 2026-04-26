/**
 * 외부 앱(파트너 ERP)이 발급한 단기 토큰을 검증.
 *
 * 토큰 포맷: HS256 JWT
 *   payload: {
 *     sub: string;       // Supabase auth.users.id (= vibox users.id)
 *     email: string;
 *     name: string;
 *     role: 'admin' | 'member' | 'partner';
 *     iat: number;       // issued at (sec)
 *     exp: number;       // expires at (sec) — 5초 정도로 짧게
 *     iss: 'partner-erp';
 *     aud: 'vibox';
 *   }
 *
 * 검증:
 *   - 서명 (VIBOX_SSO_SECRET 공유 secret)
 *   - exp / aud / iss
 *   - role 화이트리스트
 */
import { jwtVerify } from "jose";

export type SsoPayload = {
  sub: string;
  email: string;
  name: string;
  role: "admin" | "member" | "partner";
};

function getSsoSecret(): Uint8Array {
  const secret = process.env.VIBOX_SSO_SECRET;
  if (!secret) throw new Error("VIBOX_SSO_SECRET not set");
  return new TextEncoder().encode(secret);
}

export async function verifySsoToken(token: string): Promise<SsoPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSsoSecret(), {
      issuer: "partner-erp",
      audience: "vibox",
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "admin" &&
        payload.role !== "member" &&
        payload.role !== "partner")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
