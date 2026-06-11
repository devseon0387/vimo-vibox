CREATE TABLE "ai_review_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"file_path" text NOT NULL,
	"reporter_id" text NOT NULL,
	"verdict" text NOT NULL,
	"reason_tag" text,
	"note" text,
	"ai_body" text,
	"ai_suggestion" text,
	"ai_ocr_wrong" text,
	"video_time_ms" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text DEFAULT '[]' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "client_share_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token" text NOT NULL,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "client_share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"file_path" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"added_by" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"contact_email" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"erp_client_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "comment_moderations" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"body_before" text,
	"body_after" text NOT NULL,
	"edited_by" text NOT NULL,
	"edited_by_name" text NOT NULL,
	"edited_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"video_time_ms" integer NOT NULL,
	"category" text DEFAULT 'etc' NOT NULL,
	"auto_category" text DEFAULT 'etc' NOT NULL,
	"kind" text DEFAULT 'feedback' NOT NULL,
	"auto_kind" text DEFAULT 'feedback' NOT NULL,
	"annotation" text,
	"body" text NOT NULL,
	"parent_id" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"guest_name" text,
	"share_token" text,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"moderated_body" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encoding_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"fingerprint" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"enqueued_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"duration_sec" integer,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"path" text PRIMARY KEY NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_by_name" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"episode_id" text,
	"project_id" text,
	"partner_id" text
);
--> statement-breakpoint
CREATE TABLE "hls_assets" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"segment_count" integer NOT NULL,
	"total_bytes" bigint NOT NULL,
	"duration_sec" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hls_assets_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
CREATE TABLE "note_index" (
	"path" text PRIMARY KEY NOT NULL,
	"title" text,
	"excerpt" text,
	"tags" text,
	"folder" text,
	"word_count" integer,
	"modified_at" bigint NOT NULL,
	"indexed_at" bigint NOT NULL,
	"starred" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"body" text NOT NULL,
	"saved_at" bigint NOT NULL,
	"saved_by" text,
	"reason" text,
	"bytes" bigint
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "scan_history" (
	"id" text PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"started_by" text NOT NULL,
	"started_by_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"issues_found" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"file_path" text NOT NULL,
	"title" text,
	"paths" text,
	"mode" text DEFAULT 'preview' NOT NULL,
	"kind" text DEFAULT 'file' NOT NULL,
	"allow_comments" boolean DEFAULT false NOT NULL,
	"allow_download" boolean DEFAULT true NOT NULL,
	"include_feedback" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"password_hash" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_views" (
	"id" text PRIMARY KEY NOT NULL,
	"share_token" text NOT NULL,
	"file_path" text NOT NULL,
	"visitor_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"opened_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"max_position_sec" real DEFAULT 0 NOT NULL,
	"total_watch_sec" real DEFAULT 0 NOT NULL,
	"duration_sec" real,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_log" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"bytes" bigint NOT NULL,
	"source" text NOT NULL,
	"share_token" text,
	"user_id" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trash_items" (
	"id" text PRIMARY KEY NOT NULL,
	"original_path" text NOT NULL,
	"name" text NOT NULL,
	"is_folder" boolean DEFAULT false NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"deleted_by" text NOT NULL,
	"deleted_by_name" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"quota_gb" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ai_review_feedback" ADD CONSTRAINT "ai_review_feedback_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_share_tokens" ADD CONSTRAINT "client_share_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_share_tokens" ADD CONSTRAINT "client_share_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_videos" ADD CONSTRAINT "client_videos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_videos" ADD CONSTRAINT "client_videos_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_moderations" ADD CONSTRAINT "comment_moderations_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_moderations" ADD CONSTRAINT "comment_moderations_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trash_items" ADD CONSTRAINT "trash_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;