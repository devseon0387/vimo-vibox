import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  quotaGb: integer("quota_gb").notNull().default(100),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  filePath: text("file_path").notNull(),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type TrashItem = typeof trashItems.$inferSelect;
export type NewTrashItem = typeof trashItems.$inferInsert;
