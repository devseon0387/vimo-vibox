/**
 * 외부 ERP에서 vibox API를 호출할 때 CORS 처리.
 *
 * VIBOX_ALLOWED_ORIGINS 환경변수에 콤마로 구분된 origin 목록.
 * 예: "http://localhost:3010,https://partner.vi-mo.kr"
 */

export function getAllowedOrigins(): string[] {
  const raw = process.env.VIBOX_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

/**
 * 업로드 샤딩 호스트 명시 화이트리스트. 미래에 추가될 서브도메인이 자동 신뢰되지 않도록.
 * 비표준 포트(8443/18443) 직결 업로드 분배 허용.
 */
const SAME_ZONE_HOSTNAMES = new Set([
  "vibox.cloud",
  "u1.vibox.cloud",
  "u2.vibox.cloud",
  "u3.vibox.cloud",
  "u4.vibox.cloud",
  "app.vibox.cloud",
]);

function isSameZoneOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    return SAME_ZONE_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  if (!isAllowedOrigin(origin) && !isSameZoneOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // preflight 캐시 24시간 — 매 청크마다 OPTIONS 안 보내도록
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
