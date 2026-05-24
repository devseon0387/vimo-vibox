import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF 보호 — 쿠키 기반 인증 + 변경 작업(POST/PATCH/DELETE)에서 Origin/Referer 검증.
 *
 * SameSite=Lax 쿠키는 cross-site GET은 막지만 form POST top-level navigation 등은
 * 허용 → 별도의 Origin 체크 필요. 정상 브라우저는 mutating request에 항상
 * Origin (또는 Referer) 헤더를 보냄.
 */

const ALLOWED_ORIGINS = (process.env.VIBOX_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// COOKIE_DOMAIN 기반으로 base 도메인 + 모든 서브도메인 허용
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? "";
const BASE_DOMAIN = COOKIE_DOMAIN.replace(/^\./, "");

function isOriginAllowed(originStr: string): boolean {
  if (!originStr) return false;
  if (ALLOWED_ORIGINS.includes(originStr)) return true;
  try {
    const url = new URL(originStr);
    if (BASE_DOMAIN) {
      if (url.hostname === BASE_DOMAIN) return true;
      if (url.hostname.endsWith("." + BASE_DOMAIN)) return true;
    }
    // 개발 환경: localhost 허용 (production에서는 거부)
    if (process.env.NODE_ENV !== "production") {
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    }
  } catch {
    /* invalid URL */
  }
  return false;
}

export function checkSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) return isOriginAllowed(origin);
  // Origin 없는 경우 Referer fallback (구형 브라우저·일부 클라)
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      return isOriginAllowed(refUrl.origin);
    } catch {
      return false;
    }
  }
  // 둘 다 없으면 거부 (정상 브라우저는 항상 보냄)
  return false;
}

export function csrfDeny(): NextResponse {
  return NextResponse.json(
    { error: "cross-origin request denied (CSRF)" },
    { status: 403 },
  );
}
