import { pgTable, text, integer, bigint, boolean, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

// 타임스탬프: SQLite integer(ms) → PG timestamptz(mode:date). JS 타입은 Date 그대로라 앱 코드 무변경.
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
// 바이트/대용량 정수 → bigint(number). ms를 정수로 직접 쓰는 컬럼(note*)도 bigint.
const big = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member", "partner"] })
    .notNull()
    .default("member"),
  quotaGb: integer("quota_gb").notNull().default(100),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  deactivatedAt: ts("deactivated_at"),
});

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  filePath: text("file_path").notNull(),
  title: text("title"),
  paths: text("paths"),
  mode: text("mode", { enum: ["preview", "full"] }).notNull().default("preview"),
  kind: text("kind", { enum: ["file", "folder"] }).notNull().default("file"),
  allowComments: boolean("allow_comments").notNull().default(false),
  allowDownload: boolean("allow_download").notNull().default(true),
  includeFeedback: boolean("include_feedback").notNull().default(false),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  passwordHash: text("password_hash"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_share_links_created_by").on(t.createdBy),
]);

export const fileUploads = pgTable("file_uploads", {
  path: text("path").primaryKey(),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadedByName: text("uploaded_by_name").notNull(),
  uploadedAt: ts("uploaded_at").notNull().$defaultFn(() => new Date()),
  episodeId: text("episode_id"),
  projectId: text("project_id"),
  partnerId: text("partner_id"),
}, (t) => [
  index("idx_file_uploads_uploader").on(t.uploadedBy),
]);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  videoTimeMs: integer("video_time_ms").notNull(),
  category: text("category").notNull().default("etc"),
  autoCategory: text("auto_category").notNull().default("etc"),
  kind: text("kind").notNull().default("feedback"),
  autoKind: text("auto_kind").notNull().default("feedback"),
  annotation: text("annotation"),
  body: text("body").notNull(),
  parentId: text("parent_id"),
  resolvedAt: ts("resolved_at"),
  resolvedBy: text("resolved_by"),
  guestName: text("guest_name"),
  shareToken: text("share_token"),
  // Phase 1 per-client 격리 키 (nullable·추가형). 한 파일을 여러 클라(공유 링크)에 공유해도
  // A는 B의 코멘트를 못 보게 하는 스코프. NULL = 레거시/내부 코멘트(기존 file_path 단독 동작 보존).
  //   clientId      : 이 코멘트가 속한 클라(있으면). share_links→client 매핑은 Phase 1.5에서 채움.
  //   shareClientId : client_videos.id (특정 클라+파일 조합). 가장 정밀한 격리 키.
  clientId: text("client_id"),
  shareClientId: text("share_client_id"),
  visibility: text("visibility", { enum: ["internal", "client"] }).notNull().default("internal"),
  moderatedBody: text("moderated_body"),
  status: text("status", { enum: ["approved", "pending"] }).notNull().default("approved"),
  approvedAt: ts("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_comments_path").on(t.filePath),
  index("idx_comments_video_time").on(t.videoTimeMs),
  index("idx_comments_kind").on(t.kind),
  index("idx_comments_status").on(t.status),
  index("idx_comments_visibility").on(t.visibility),
  // Phase 1: per-client 코멘트 조회용 (file_path + client 컨텍스트). NULL 많은 컬럼이라 부분 인덱스 아님.
  index("idx_comments_client").on(t.clientId),
  index("idx_comments_share_client").on(t.shareClientId),
]);

export const commentModerations = pgTable("comment_moderations", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  bodyBefore: text("body_before"),
  bodyAfter: text("body_after").notNull(),
  editedBy: text("edited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  editedByName: text("edited_by_name").notNull(),
  editedAt: ts("edited_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_moderations_comment").on(t.commentId),
]);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentModeration = typeof commentModerations.$inferSelect;
export type NewCommentModeration = typeof commentModerations.$inferInsert;
export type FileUpload = typeof fileUploads.$inferSelect;
export type NewFileUpload = typeof fileUploads.$inferInsert;

export const trashItems = pgTable("trash_items", {
  id: text("id").primaryKey(),
  originalPath: text("original_path").notNull(),
  name: text("name").notNull(),
  isFolder: boolean("is_folder").notNull().default(false),
  size: big("size").notNull().default(0),
  deletedBy: text("deleted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  deletedByName: text("deleted_by_name").notNull(),
  deletedAt: ts("deleted_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_trash_deleted_at").on(t.deletedAt),
]);

export const scanHistory = pgTable("scan_history", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  startedBy: text("started_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedByName: text("started_by_name").notNull(),
  startedAt: ts("started_at").notNull().$defaultFn(() => new Date()),
  finishedAt: ts("finished_at"),
  status: text("status", { enum: ["running", "done", "failed", "cancelled"] }).notNull().default("running"),
  issuesFound: integer("issues_found"),
  error: text("error"),
}, (t) => [
  index("idx_scan_history_path").on(t.filePath),
  index("idx_scan_history_started").on(t.startedAt),
]);

export const trafficLog = pgTable("traffic_log", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  bytes: big("bytes").notNull(),
  source: text("source", { enum: ["download", "share", "thumb", "upload"] }).notNull(),
  shareToken: text("share_token"),
  userId: text("user_id"),
  at: ts("at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_traffic_at").on(t.at),
  index("idx_traffic_source").on(t.source),
  index("idx_traffic_path").on(t.path),
  index("idx_traffic_share").on(t.shareToken),
]);

export type TrafficLog = typeof trafficLog.$inferSelect;
export type NewTrafficLog = typeof trafficLog.$inferInsert;

export const encodingJobs = pgTable("encoding_jobs", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  fingerprint: text("fingerprint"),
  status: text("status", { enum: ["queued", "running", "done", "failed", "cancelled"] }).notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  enqueuedAt: ts("enqueued_at").notNull().$defaultFn(() => new Date()),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  error: text("error"),
  durationSec: integer("duration_sec"),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [
  index("idx_encoding_status").on(t.status),
  index("idx_encoding_file").on(t.filePath),
]);

export const hlsAssets = pgTable("hls_assets", {
  fingerprint: text("fingerprint").primaryKey(),
  filePath: text("file_path").notNull().unique(),
  segmentCount: integer("segment_count").notNull(),
  totalBytes: big("total_bytes").notNull(),
  durationSec: integer("duration_sec").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export type EncodingJob = typeof encodingJobs.$inferSelect;
export type NewEncodingJob = typeof encodingJobs.$inferInsert;
export type HlsAsset = typeof hlsAssets.$inferSelect;
export type NewHlsAsset = typeof hlsAssets.$inferInsert;

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  erpClientId: text("erp_client_id"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_clients_active").on(t.active),
  index("idx_clients_erp_id").on(t.erpClientId),
]);

export const clientVideos = pgTable("client_videos", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  addedAt: ts("added_at").notNull().$defaultFn(() => new Date()),
  addedBy: text("added_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["draft", "sent", "approved", "archived"] }).notNull().default("draft"),
  displayOrder: integer("display_order").notNull().default(0),
}, (t) => [
  index("idx_client_videos_client").on(t.clientId),
  index("idx_client_videos_path").on(t.filePath),
  uniqueIndex("idx_client_videos_unique").on(t.clientId, t.filePath),
]);

export const clientShareTokens = pgTable("client_share_tokens", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  allowComments: boolean("allow_comments").notNull().default(true),
  allowDownload: boolean("allow_download").notNull().default(false),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_client_share_tokens_client").on(t.clientId),
]);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientVideo = typeof clientVideos.$inferSelect;
export type NewClientVideo = typeof clientVideos.$inferInsert;
export type ClientShareToken = typeof clientShareTokens.$inferSelect;
export type NewClientShareToken = typeof clientShareTokens.$inferInsert;

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: text("scopes").notNull().default("[]"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull(),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [
  index("idx_api_tokens_created_by").on(t.createdBy),
]);
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export const shareViews = pgTable(
  "share_views",
  {
    id: text("id").primaryKey(),
    shareToken: text("share_token").notNull(),
    filePath: text("file_path").notNull(),
    visitorId: text("visitor_id").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    openedAt: ts("opened_at").notNull(),
    lastEventAt: ts("last_event_at").notNull(),
    maxPositionSec: real("max_position_sec").notNull().default(0),
    totalWatchSec: real("total_watch_sec").notNull().default(0),
    durationSec: real("duration_sec"),
    completed: boolean("completed").notNull().default(false),
    // Phase 1 per-client 격리 키 (nullable·추가형). 시청기록도 클라별로 분리하기 위한 컨텍스트.
    // 기존 격리는 share_token 단위(이미 링크별 분리)지만, 한 클라에 여러 링크가 묶일 때를 대비해
    // client 컨텍스트를 명시 저장. NULL = 레거시(기존 token+visitor+path 동작 그대로).
    clientId: text("client_id"),
    shareClientId: text("share_client_id"),
  },
  // ping/route.ts 의 onConflictDoUpdate(target = token+visitor+path)가 의존하는 유니크 인덱스.
  // SQLite 시절 migrate.sql 에만 있고 PG schema 엔 누락 → PG 이전 후 share_view 업서트가
  // "no unique constraint" 로 깨지던 원인(THEN 1 타입에러가 먼저 떠 가려졌었음).
  (t) => [
    uniqueIndex("idx_share_views_visitor_unique").on(
      t.shareToken,
      t.visitorId,
      t.filePath,
    ),
    index("idx_share_views_token_path").on(t.shareToken, t.filePath),
    index("idx_share_views_last_event").on(t.lastEventAt),
    index("idx_share_views_client").on(t.clientId),
  ],
);
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

// ───── vinote — 파일이 truth, DB는 인덱스·이력 (ms를 정수로 직접 사용 → bigint) ─────
export const noteIndex = pgTable("note_index", {
  path: text("path").primaryKey(),
  title: text("title"),
  excerpt: text("excerpt"),
  tags: text("tags"),
  folder: text("folder"),
  wordCount: integer("word_count"),
  modifiedAt: big("modified_at").notNull(),
  indexedAt: big("indexed_at").notNull(),
  starred: boolean("starred").notNull().default(false),
}, (t) => [
  index("idx_note_index_modified").on(t.modifiedAt.desc()),
  index("idx_note_index_folder").on(t.folder),
]);
export type NoteIndex = typeof noteIndex.$inferSelect;
export type NewNoteIndex = typeof noteIndex.$inferInsert;

export const noteVersions = pgTable("note_versions", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  body: text("body").notNull(),
  savedAt: big("saved_at").notNull(),
  savedBy: text("saved_by"),
  reason: text("reason"),
  bytes: big("bytes"),
}, (t) => [
  index("idx_note_versions_path_saved").on(t.path, t.savedAt.desc()),
]);
export type NoteVersion = typeof noteVersions.$inferSelect;
export type NewNoteVersion = typeof noteVersions.$inferInsert;

// note_fts (FTS5)는 PG 미지원 → 이전 보류(prod 0행). 검색은 ILIKE 폴백으로 스텁(lib/notes-index.ts).

export const aiReviewFeedback = pgTable("ai_review_feedback", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull(),
  filePath: text("file_path").notNull(),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  verdict: text("verdict", { enum: ["good", "bad", "partial"] }).notNull(),
  reasonTag: text("reason_tag", {
    enum: ["ocr_misread", "wrong_correction", "context_wrong", "not_a_typo", "partial_fix", "other"],
  }),
  note: text("note"),
  aiBody: text("ai_body"),
  aiSuggestion: text("ai_suggestion"),
  aiOcrWrong: text("ai_ocr_wrong"),
  videoTimeMs: integer("video_time_ms"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  index("idx_ai_feedback_comment").on(t.commentId),
]);
export type AiReviewFeedback = typeof aiReviewFeedback.$inferSelect;
export type NewAiReviewFeedback = typeof aiReviewFeedback.$inferInsert;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  expiresAt: ts("expires_at"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  lastUsedAt: ts("last_used_at"),
  failureCount: integer("failure_count").notNull().default(0),
});
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
