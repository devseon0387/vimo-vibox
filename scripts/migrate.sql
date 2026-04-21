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

-- 2026-04-20: 영상 피드백 댓글 테이블
-- category: txt/cut/col/aud/mtn/etc (자막/컷/색감/오디오/모션/기타)
-- auto_category: 키워드 감지 결과 (학습 데이터용)
-- kind: feedback(수정 요청) / praise(칭찬)
-- auto_kind: 키워드 감지 결과 (학습 데이터용)
-- annotation: 자막 수정 주석 (JSON: {bbox, original, suggestion, note})
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  video_time_ms INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'etc',
  auto_category TEXT NOT NULL DEFAULT 'etc',
  kind TEXT NOT NULL DEFAULT 'feedback',
  auto_kind TEXT NOT NULL DEFAULT 'feedback',
  annotation TEXT,
  body TEXT NOT NULL,
  parent_id TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_path ON comments(file_path);
CREATE INDEX IF NOT EXISTS idx_comments_video_time ON comments(video_time_ms);
CREATE INDEX IF NOT EXISTS idx_comments_kind ON comments(kind);

-- 2026-04-20: AI 검수용 시스템 유저
-- password_hash는 로그인 불가능한 더미값 (실제 로그인 불가)
INSERT OR IGNORE INTO users (id, username, email, name, password_hash, role, quota_gb, created_at)
VALUES ('ai-reviewer', 'ai-reviewer', NULL, 'AI 검수', '!', 'member', 0, 0);

-- 2026-04-21: AI 검수 히스토리 (언제 누가 실행, 몇 건 발견)
CREATE TABLE IF NOT EXISTS scan_history (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  started_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_by_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  issues_found INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_scan_history_path ON scan_history(file_path);
CREATE INDEX IF NOT EXISTS idx_scan_history_started ON scan_history(started_at);

-- 2026-04-21: 공유 링크 확장 — 프로젝트 모드 (여러 파일 + 옵션)
-- Supabase/Postgres 호환 위해 ALTER ADD COLUMN IF NOT EXISTS 패턴
-- (SQLite는 IF NOT EXISTS 지원 안 하므로 에러 무시 트릭)
-- 수동으로 하나씩 추가 (이미 있으면 에러 뜨지만 무시)
ALTER TABLE share_links ADD COLUMN title TEXT;
ALTER TABLE share_links ADD COLUMN paths TEXT; -- JSON array ["/a.mp4", "/b.mp4"]
ALTER TABLE share_links ADD COLUMN allow_comments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE share_links ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1;

-- 2026-04-21: 게스트 댓글 지원 (공유 링크로 들어온 클라이언트)
ALTER TABLE comments ADD COLUMN guest_name TEXT;
ALTER TABLE comments ADD COLUMN share_token TEXT; -- 어느 공유 링크에서 온 댓글인지

-- 2026-04-21: 게스트 시스템 유저 (비회원 댓글 author_id로 사용)
INSERT OR IGNORE INTO users (id, username, email, name, password_hash, role, quota_gb, created_at)
VALUES ('guest', 'guest', NULL, '게스트', '!', 'member', 0, 0);

-- 2026-04-21: 파일 업로드 소유권 추적
-- (파일 목록은 FS 기반이지만 소유권은 DB로 — partner 가시성 용도)
CREATE TABLE IF NOT EXISTS file_uploads (
  path TEXT PRIMARY KEY,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by_name TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_uploads_uploader ON file_uploads(uploaded_by);
