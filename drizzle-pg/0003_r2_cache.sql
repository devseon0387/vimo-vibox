-- R2 "가장 빠른 다운로드 경로" 캐시 목록.
-- 외부 공유된 최신 영상(예산 ≤~9.5GB, TTL 3일)을 R2에 두고 거기서 직배. 정본은 항상 M2.
-- 행 존재 = 현재 R2에 올라가 있음 → /api/s 가 presigned R2 로 302. 없으면 M2 스트리밍 폴백.
-- 안전: CREATE TABLE IF NOT EXISTS (재실행 무해). 적용: baseon_admin 수동 또는 `drizzle-kit push`.
CREATE TABLE IF NOT EXISTS "r2_cache" (
  "path" text PRIMARY KEY NOT NULL,
  "r2_key" text NOT NULL,
  "bytes" bigint NOT NULL,
  "share_token" text,
  "cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_r2_cache_cached_at" ON "r2_cache" ("cached_at");
