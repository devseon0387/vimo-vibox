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
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type TrashItem = typeof trashItems.$inferSelect;
export type NewTrashItem = typeof trashItems.$inferInsert;
export type ScanHistory = typeof scanHistory.$inferSelect;
export type NewScanHistory = typeof scanHistory.$inferInsert;
