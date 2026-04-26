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

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export function preflight(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
