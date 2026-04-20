-- Vibox 스키마 마이그레이션 (멱등)
-- 재실행해도 안전하도록 모든 DDL은 IF NOT EXISTS 사용

-- 2026-04-20: 휴지통 테이블
CREATE TABLE IF NOT EXISTS trash_items (
  id TEXT PRIMARY KEY,
  original_path TEXT NOT NULL,
  name TEXT NOT NULL,
  is_folder INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  deleted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_by_name TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash_items(deleted_at);
