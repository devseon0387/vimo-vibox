/**
 * 메모리 기반 레이트 리밋 (싱글 인스턴스 환경 가정).
 * 다중 인스턴스로 확장 시 Redis 등 외부 스토어 필요.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.max - 1, retryAfterSec: 0 };
  }
  if (existing.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: opts.max - existing.count,
    retryAfterSec: 0,
  };
}

// 주기적 GC (매 5분)
if (typeof setInterval !== "undefined") {
  const maybeTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, 5 * 60 * 1000);
  if (typeof maybeTimer === "object" && maybeTimer && "unref" in maybeTimer) {
    (maybeTimer as unknown as { unref: () => void }).unref();
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
