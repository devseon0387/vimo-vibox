import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member", "partner"] })
    .notNull()
    .default("member"),
  quotaGb: integer("quota_gb").notNull().default(100),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // soft delete — hard delete 시 모든 audit (comments/trash/api_tokens 등) cascade로 사라지므로
  // admin 사용자 삭제는 deactivate로만. 로그인은 막힘 + UI에서 비활성 표시.
  deactivatedAt: integer("deactivated_at", { mode: "timestamp_ms" }),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  filePath: text("file_path").notNull(), // backward compat (단일 파일)
  title: text("title"),
  paths: text("paths"), // JSON array ["/a.mp4", "/b.mp4"] — 여러 파일 묶음
  mode: text("mode", { enum: ["preview", "full"] })
    .notNull()
    .default("preview"),
  // 공유 종류: file (단일/묶음 파일) | folder (폴더 통째 — 동적 탐색)
  kind: text("kind", { enum: ["file", "folder"] })
    .notNull()
    .default("file"),
  allowComments: integer("allow_comments", { mode: "boolean" })
    .notNull()
    .default(false),
  allowDownload: integer("allow_download", { mode: "boolean" })
    .notNull()
    .default(true),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  passwordHash: text("password_hash"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const fileUploads = sqliteTable("file_uploads", {
  path: text("path").primaryKey(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  uploadedByName: text("uploaded_by_name").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  // 외부 ERP 연동 (Supabase 측 식별자) — nullable
  episodeId: text("episode_id"),
  projectId: text("project_id"),
  partnerId: text("partner_id"),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  videoTimeMs: integer("video_time_ms").notNull(),
  category: text("category").notNull().default("etc"),
  autoCategory: text("auto_category").notNull().default("etc"),
  kind: text("kind").notNull().default("feedback"),
  autoKind: text("auto_kind").notNull().default("feedback"),
  annotation: text("annotation"),
  body: text("body").notNull(),
  parentId: text("parent_id"),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  resolvedBy: text("resolved_by"),
  // 게스트(공유 링크 비회원) 댓글: authorId='guest', guestName에 실제 이름
  guestName: text("guest_name"),
  shareToken: text("share_token"), // 어느 공유링크에서 작성한 댓글인지
  // 매니저 승인 게이트 + 클라 가시성 (2026-04-22)
  visibility: text("visibility", { enum: ["internal", "client"] })
    .notNull()
    .default("internal"),
  moderatedBody: text("moderated_body"),
  status: text("status", { enum: ["approved", "pending"] })
    .notNull()
    .default("approved"),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
  approvedBy: text("approved_by"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const commentModerations = sqliteTable("comment_moderations", {
  id: text("id").primaryKey(),
  commentId: text("comment_id")
    .notNull()
    .references(() => comments.id, { onDelete: "cascade" }),
  bodyBefore: text("body_before"),
  bodyAfter: text("body_after").notNull(),
  editedBy: text("edited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  editedByName: text("edited_by_name").notNull(),
  editedAt: integer("edited_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentModeration = typeof commentModerations.$inferSelect;
export type NewCommentModeration = typeof commentModerations.$inferInsert;
export type FileUpload = typeof fileUploads.$inferSelect;
export type NewFileUpload = typeof fileUploads.$inferInsert;

export const trashItems = sqliteTable("trash_items", {
  id: text("id").primaryKey(),
  originalPath: text("original_path").notNull(),
  name: text("name").notNull(),
  isFolder: integer("is_folder", { mode: "boolean" }).notNull().default(false),
  size: integer("size").notNull().default(0),
  deletedBy: text("deleted_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deletedByName: text("deleted_by_name").notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const scanHistory = sqliteTable("scan_history", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  startedBy: text("started_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedByName: text("started_by_name").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["running", "done", "failed", "cancelled"] })
    .notNull()
    .default("running"),
  issuesFound: integer("issues_found"),
  error: text("error"),
});

export const trafficLog = sqliteTable("traffic_log", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  bytes: integer("bytes").notNull(),
  source: text("source", {
    enum: ["download", "share", "thumb", "upload"],
  }).notNull(),
  shareToken: text("share_token"),
  userId: text("user_id"),
  at: integer("at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type TrafficLog = typeof trafficLog.$inferSelect;
export type NewTrafficLog = typeof trafficLog.$inferInsert;

// HLS 인코딩 작업 큐
export const encodingJobs = sqliteTable("encoding_jobs", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  fingerprint: text("fingerprint"),
  status: text("status", {
    enum: ["queued", "running", "done", "failed", "cancelled"],
  })
    .notNull()
    .default("queued"),
  progress: integer("progress").notNull().default(0), // 0~100
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  error: text("error"),
  durationSec: integer("duration_sec"),
  // 재시도 횟수 (실패 시 자동 재시도, 최대 3회 후 failed 확정)
  attempts: integer("attempts").notNull().default(0),
});

// HLS 자산 메타 (file_path → fingerprint 매핑)
export const hlsAssets = sqliteTable("hls_assets", {
  fingerprint: text("fingerprint").primaryKey(),
  filePath: text("file_path").notNull().unique(),
  segmentCount: integer("segment_count").notNull(),
  totalBytes: integer("total_bytes").notNull(),
  durationSec: integer("duration_sec").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type EncodingJob = typeof encodingJobs.$inferSelect;
export type NewEncodingJob = typeof encodingJobs.$inferInsert;
export type HlsAsset = typeof hlsAssets.$inferSelect;
export type NewHlsAsset = typeof hlsAssets.$inferInsert;

// ─── Client (외부 클라이언트 — 광고주·브랜드 등) ───
// 한 클라가 여러 영상을 누적해서 받음. 한 영상이 여러 클라에 동시 공유될 수 있음 (M:N).
// 비모 ERP 에서 가져온 경우 erpClientId 에 ERP 측 uuid 저장 (재import 멱등성)
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // /c/{slug}
  contactEmail: text("contact_email"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  erpClientId: text("erp_client_id"), // 비모 ERP clients.id 매핑
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const clientVideos = sqliteTable("client_videos", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(), // 실제 파일 경로 (/Rendering/...)
  addedAt: integer("added_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  addedBy: text("added_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["draft", "sent", "approved", "archived"],
  })
    .notNull()
    .default("draft"),
  displayOrder: integer("display_order").notNull().default(0),
});

// 클라당 누적 공유 토큰 (한 토큰이 그 클라의 모든 영상 노출)
export const clientShareTokens = sqliteTable("client_share_tokens", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  allowComments: integer("allow_comments", { mode: "boolean" })
    .notNull()
    .default(true),
  allowDownload: integer("allow_download", { mode: "boolean" })
    .notNull()
    .default(false),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientVideo = typeof clientVideos.$inferSelect;
export type NewClientVideo = typeof clientVideos.$inferInsert;
export type ClientShareToken = typeof clientShareTokens.$inferSelect;
export type NewClientShareToken = typeof clientShareTokens.$inferInsert;

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: text("scopes").notNull().default("[]"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export const shareViews = sqliteTable("share_views", {
  id: text("id").primaryKey(),
  shareToken: text("share_token").notNull(),
  filePath: text("file_path").notNull(),
  visitorId: text("visitor_id").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
  lastEventAt: integer("last_event_at", { mode: "timestamp_ms" }).notNull(),
  maxPositionSec: real("max_position_sec").notNull().default(0),
  totalWatchSec: real("total_watch_sec").notNull().default(0),
  durationSec: real("duration_sec"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
});
export type ShareView = typeof shareViews.$inferSelect;
export type NewShareView = typeof shareViews.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type TrashItem = typeof trashItems.$inferSelect;
export type NewTrashItem = typeof trashItems.$inferInsert;
export type ScanHistory = typeof scanHistory.$inferSelect;
export type NewScanHistory = typeof scanHistory.$inferInsert;

// ───── vinote (글쓰기 컴패니언) — 파일이 truth, DB는 인덱스·이력 ─────
export const noteIndex = sqliteTable("note_index", {
  path: text("path").primaryKey(),           // '/notes/일기/2026-05-24.md'
  title: text("title"),
  excerpt: text("excerpt"),
  tags: text("tags"),                         // JSON array
  folder: text("folder"),
  wordCount: integer("word_count"),
  modifiedAt: integer("modified_at").notNull(), // mtime ms — ETag
  indexedAt: integer("indexed_at").notNull(),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
});
export type NoteIndex = typeof noteIndex.$inferSelect;
export type NewNoteIndex = typeof noteIndex.$inferInsert;

export const noteVersions = sqliteTable("note_versions", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  body: text("body").notNull(),
  savedAt: integer("saved_at").notNull(),
  savedBy: text("saved_by"),
  reason: text("reason"),                     // autosave | manual | conflict | restore
  bytes: integer("bytes"),
});
export type NoteVersion = typeof noteVersions.$inferSelect;
export type NewNoteVersion = typeof noteVersions.$inferInsert;

// note_fts는 FTS5 가상 테이블이라 drizzle table 정의 없음. 직접 SQL로 INSERT/SELECT.

// AI 검수 결과에 대한 사용자 피드백 — 추후 OCR/Claude 프롬프트 개선 분석용.
// commentId 는 FK 미설정 (재검수로 AI 댓글 삭제·재삽입되어도 피드백은 살아남음).
// AI 댓글 본문/제안/OCR원문 스냅샷을 같이 저장해서 댓글이 사라져도 분석 가능.
export const aiReviewFeedback = sqliteTable("ai_review_feedback", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull(),
  filePath: text("file_path").notNull(),
  reporterId: text("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  verdict: text("verdict", { enum: ["good", "bad", "partial"] }).notNull(),
  reasonTag: text("reason_tag", {
    enum: [
      "ocr_misread",
      "wrong_correction",
      "context_wrong",
      "not_a_typo",
      "partial_fix",
      "other",
    ],
  }),
  note: text("note"),
  // 스냅샷 (재검수로 댓글 사라져도 컨텍스트 유지)
  aiBody: text("ai_body"),
  aiSuggestion: text("ai_suggestion"),
  aiOcrWrong: text("ai_ocr_wrong"),
  videoTimeMs: integer("video_time_ms"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
export type AiReviewFeedback = typeof aiReviewFeedback.$inferSelect;
export type NewAiReviewFeedback = typeof aiReviewFeedback.$inferInsert;

// Web Push 구독. 한 사용자가 여러 디바이스(브라우저·OS·세션) 가질 수 있음.
// endpoint 는 push service URL → 고유. p256dh/auth 는 ECDH 키.
// expiresAt 은 push service 가 알려준 만료 시각(밀리초). 만료 시 자동 정리 대상.
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  // 발송 실패 누적 — 410 Gone 이나 N회 연속 실패 시 prune.
  failureCount: integer("failure_count").notNull().default(0),
});
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
