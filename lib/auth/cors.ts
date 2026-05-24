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
 * 업로드 샤딩(u1/u2.vibox.cloud[:port])에서 같은 zone 의 subdomain 간 호출이
 * CORS 통과하도록 *.vibox.cloud 를 자동 허용. ERP 화이트리스트와는 별개.
 * 비표준 포트(8443/18443) 직결 업로드 분배도 허용.
 */
function isSameZoneOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    return url.hostname === "vibox.cloud" || url.hostname.endsWith(".vibox.cloud");
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
