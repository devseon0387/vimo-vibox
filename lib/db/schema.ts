import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type TrashItem = typeof trashItems.$inferSelect;
export type NewTrashItem = typeof trashItems.$inferInsert;
export type ScanHistory = typeof scanHistory.$inferSelect;
export type NewScanHistory = typeof scanHistory.$inferInsert;
