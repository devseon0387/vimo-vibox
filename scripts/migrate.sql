-- Vibox 스키마 마이그레이션 (멱등)
-- 재실행해도 안전하도록 모든 DDL은 IF NOT EXISTS 사용
-- 새 머신/DR 시 처음부터 실행해도 동작해야 함 (FK 의존성 순서 주의)

-- 2026-05-02 추가: DR 안전성을 위해 base 테이블 (users, share_links) 명시적 정의
-- 이전엔 lib/db/migrations.ts에서만 생성되어 fresh DB에서 이 파일 단독 실행 시 FK 깨짐.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- admin | member | partner
  quota_gb INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  title TEXT,
  paths TEXT,                               -- JSON array (다중 파일)
  mode TEXT NOT NULL DEFAULT 'preview',     -- preview | full
  allow_comments INTEGER NOT NULL DEFAULT 0,
  allow_download INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER,
  password_hash TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links(created_by);

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

-- 2026-04-22: 클라이언트 피드백 워크플로 (매니저 승인 게이트 + 순화)
-- visibility: 'internal' (기본) / 'client' (클라이언트 뷰에 공개)
-- status: 'approved' (기본, 바로 보임) / 'pending' (매니저 승인 대기, 게스트 댓글 전용)
-- moderated_body: 매니저가 순화한 내부용 텍스트 (null이면 원문 사용)
ALTER TABLE comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE comments ADD COLUMN moderated_body TEXT;
ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE comments ADD COLUMN approved_at INTEGER;
ALTER TABLE comments ADD COLUMN approved_by TEXT;
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_visibility ON comments(visibility);

-- 2026-04-22: 공유 링크 프리뷰/풀 모드
-- mode: 'preview' (재생 전용) / 'full' (피드백 가능)
ALTER TABLE share_links ADD COLUMN mode TEXT NOT NULL DEFAULT 'preview';

-- 2026-04-22: 순화본 편집 히스토리 (admin/member만 열람)
CREATE TABLE IF NOT EXISTS comment_moderations (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  body_before TEXT,       -- 수정 전 moderated_body (최초 수정이면 null)
  body_after TEXT NOT NULL,
  edited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edited_by_name TEXT NOT NULL,
  edited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderations_comment ON comment_moderations(comment_id);

-- 2026-04-22: 트래픽 로그 (아웃바운드 바이트 집계)
-- source: 'download' (내부 다운로드) | 'share' (공유 링크) | 'thumb' | 'upload' (들어오는 바이트)
CREATE TABLE IF NOT EXISTS traffic_log (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  source TEXT NOT NULL,
  share_token TEXT,
  user_id TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traffic_at ON traffic_log(at);
CREATE INDEX IF NOT EXISTS idx_traffic_source ON traffic_log(source);
CREATE INDEX IF NOT EXISTS idx_traffic_path ON traffic_log(path);
CREATE INDEX IF NOT EXISTS idx_traffic_share ON traffic_log(share_token);

-- 2026-04-25: HLS 인코딩 큐 + 자산 매핑 (Phase 1 — 스트리밍 최적화)
-- encoding_jobs: ffmpeg HLS 변환 작업 큐 (max 2 동시, FIFO)
CREATE TABLE IF NOT EXISTS encoding_jobs (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled
  progress INTEGER NOT NULL DEFAULT 0,    -- 0~100
  enqueued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  error TEXT,
  duration_sec INTEGER
);
CREATE INDEX IF NOT EXISTS idx_encoding_status ON encoding_jobs(status);
CREATE INDEX IF NOT EXISTS idx_encoding_file ON encoding_jobs(file_path);
ALTER TABLE encoding_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

-- hls_assets: 변환 완료된 HLS 자산 레지스트리 (file_path → fingerprint)
CREATE TABLE IF NOT EXISTS hls_assets (
  fingerprint TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  segment_count INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hls_file ON hls_assets(file_path);

-- ─── 클라이언트 (외부 광고주·브랜드) ───
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);

-- M:N 매핑 (한 영상 ↔ 여러 클라)
CREATE TABLE IF NOT EXISTS client_videos (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | approved | archived
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_client_videos_client ON client_videos(client_id);
CREATE INDEX IF NOT EXISTS idx_client_videos_path ON client_videos(file_path);
-- 동일 (client_id, file_path) 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_videos_unique ON client_videos(client_id, file_path);

CREATE TABLE IF NOT EXISTS client_share_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  allow_comments INTEGER NOT NULL DEFAULT 1,
  allow_download INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_share_tokens_client ON client_share_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_client_share_tokens_token ON client_share_tokens(token);

-- 2026-04-26: 비모 ERP 클라 import 매핑 (erp_client_id)
ALTER TABLE clients ADD COLUMN erp_client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_erp_id ON clients(erp_client_id);

-- 2026-05-02: 외부 API 토큰 (Claude → 비박스 노트 저장 등)
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_created_by ON api_tokens(created_by);

-- 2026-05-02: 공유 링크 시청 트래킹 (admin only intel)
CREATE TABLE IF NOT EXISTS share_views (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL,
  file_path TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  opened_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  max_position_sec REAL NOT NULL DEFAULT 0,
  total_watch_sec REAL NOT NULL DEFAULT 0,
  duration_sec REAL,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_views_token ON share_views(share_token);
CREATE INDEX IF NOT EXISTS idx_share_views_token_path ON share_views(share_token, file_path);
CREATE INDEX IF NOT EXISTS idx_share_views_last_event ON share_views(last_event_at);

-- 2026-05-02: (token, visitor, path) 동시 ping race로 중복 row 생성 방지
-- 기존 idx_share_views_visitor (non-unique) 대체. drizzle insert에 onConflictDoUpdate 사용.
DROP INDEX IF EXISTS idx_share_views_visitor;
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_views_visitor_unique
  ON share_views(share_token, visitor_id, file_path);

-- 2026-05-24: share_links.revoked_at — soft delete + CF 캐시 후에도 즉시 무효화 검증
ALTER TABLE share_links ADD COLUMN revoked_at INTEGER;

-- 2026-05-24: users.deactivated_at — admin 삭제를 soft delete로 변경
-- (이전 hard delete는 comments/trash/api_tokens 등 ON DELETE CASCADE로 모든 작업 이력 손실)
ALTER TABLE users ADD COLUMN deactivated_at INTEGER;

-- 2026-05-24: vinote (글쓰기 컴패니언) 인덱스·이력 테이블
-- 파일(Notes/*.md)이 truth, DB는 검색·이력 보조
CREATE TABLE IF NOT EXISTS note_index (
  path        TEXT PRIMARY KEY,
  title       TEXT,
  excerpt     TEXT,
  tags        TEXT,             -- JSON array
  folder      TEXT,
  word_count  INTEGER,
  modified_at INTEGER NOT NULL, -- mtime ms (ETag 용)
  indexed_at  INTEGER NOT NULL,
  starred     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_note_index_modified ON note_index(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_index_folder   ON note_index(folder);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  path UNINDEXED, title, body, content=''
);

CREATE TABLE IF NOT EXISTS note_versions (
  id        TEXT PRIMARY KEY,
  path      TEXT NOT NULL,
  body      TEXT NOT NULL,
  saved_at  INTEGER NOT NULL,
  saved_by  TEXT,
  reason    TEXT,               -- autosave | manual | conflict | restore
  bytes     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_note_versions_path_saved
  ON note_versions(path, saved_at DESC);
