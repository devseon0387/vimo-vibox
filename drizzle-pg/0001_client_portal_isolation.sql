-- Phase 1 — 클라이언트 포털 격리 (PostgreSQL, 추가형·멱등)
-- 같은 영상 파일을 여러 고객사(client)에 공유해도 코멘트/시청기록을 클라별로 격리하기 위한
-- 컨텍스트 컬럼 + 인덱스. 전부 nullable·IF NOT EXISTS → 미적용 상태에서도 앱이 깨지지 않음.
--
-- ⚠️ 적용 방법(수동, 사용자 승인 하에):
--   drizzle-kit push 는 schema.ts 와 DB 차이를 자동 비교하지만, 이 레포의 PG 운영 인덱스는
--   과거 수동 적용된 이력이 있어(메모: 2026-06-14 누락 30개 수동 반영) push 가 의도치 않은
--   인덱스 재생성/충돌을 낼 수 있음. 따라서 이 파일은 psql 로 직접 실행하는 것을 권장.
--   (NOT NULL / 데이터 변경 / DROP 없음 — 안전 규칙 준수)

-- 1) comments: per-client 격리 키 (nullable)
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "client_id" text;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "share_client_id" text;
CREATE INDEX IF NOT EXISTS "idx_comments_client" ON "comments" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_comments_share_client" ON "comments" ("share_client_id");

-- 2) share_views: per-client 시청기록 격리 키 (nullable)
ALTER TABLE "share_views" ADD COLUMN IF NOT EXISTS "client_id" text;
ALTER TABLE "share_views" ADD COLUMN IF NOT EXISTS "share_client_id" text;
CREATE INDEX IF NOT EXISTS "idx_share_views_client" ON "share_views" ("client_id");

-- 3) client_videos: 같은 파일 다중 클라 공유 허용 + 클라 내 중복 등록 방지
--    (이미 prod 에 수동 반영되어 있을 수 있음 → IF NOT EXISTS 로 멱등)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_videos_unique"
  ON "client_videos" ("client_id", "file_path");
