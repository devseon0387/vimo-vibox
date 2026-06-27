-- 업로드 dedup(콘텐츠 주소): file_uploads 에 content_hash(SHA256) + file_size 추가.
-- 같은 hash+size 파일은 물리 1벌 + 하드링크 공유로 dedup. 원본 바이트는 보존(읽으면 그대로).
-- 안전: ADD COLUMN IF NOT EXISTS (재실행/부분적용에도 무해). nullable = 기존 행/백필 전 NULL.
-- 적용: baseon_admin 수동 실행 또는 `drizzle-kit push`. (deploy.sh 는 DB 안 건드림.)

ALTER TABLE "file_uploads" ADD COLUMN IF NOT EXISTS "content_hash" text;
ALTER TABLE "file_uploads" ADD COLUMN IF NOT EXISTS "file_size" bigint;
CREATE INDEX IF NOT EXISTS "idx_file_uploads_content_hash" ON "file_uploads" ("content_hash");
