CREATE TABLE `ai_review_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`file_path` text NOT NULL,
	`reporter_id` text NOT NULL,
	`verdict` text NOT NULL,
	`reason_tag` text,
	`note` text,
	`ai_body` text,
	`ai_suggestion` text,
	`ai_ocr_wrong` text,
	`video_time_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `client_share_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`token` text NOT NULL,
	`allow_comments` integer DEFAULT true NOT NULL,
	`allow_download` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_share_tokens_token_unique` ON `client_share_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `client_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`file_path` text NOT NULL,
	`added_at` integer NOT NULL,
	`added_by` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`contact_email` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`erp_client_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_slug_unique` ON `clients` (`slug`);--> statement-breakpoint
CREATE TABLE `comment_moderations` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`body_before` text,
	`body_after` text NOT NULL,
	`edited_by` text NOT NULL,
	`edited_by_name` text NOT NULL,
	`edited_at` integer NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`video_time_ms` integer NOT NULL,
	`category` text DEFAULT 'etc' NOT NULL,
	`auto_category` text DEFAULT 'etc' NOT NULL,
	`kind` text DEFAULT 'feedback' NOT NULL,
	`auto_kind` text DEFAULT 'feedback' NOT NULL,
	`annotation` text,
	`body` text NOT NULL,
	`parent_id` text,
	`resolved_at` integer,
	`resolved_by` text,
	`guest_name` text,
	`share_token` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`moderated_body` text,
	`status` text DEFAULT 'approved' NOT NULL,
	`approved_at` integer,
	`approved_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `encoding_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`fingerprint` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`enqueued_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`duration_sec` integer,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_uploads` (
	`path` text PRIMARY KEY NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_by_name` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`episode_id` text,
	`project_id` text,
	`partner_id` text,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hls_assets` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`segment_count` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hls_assets_file_path_unique` ON `hls_assets` (`file_path`);--> statement-breakpoint
CREATE TABLE `note_index` (
	`path` text PRIMARY KEY NOT NULL,
	`title` text,
	`excerpt` text,
	`tags` text,
	`folder` text,
	`word_count` integer,
	`modified_at` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	`starred` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`body` text NOT NULL,
	`saved_at` integer NOT NULL,
	`saved_by` text,
	`reason` text,
	`bytes` integer
);
--> statement-breakpoint
CREATE TABLE `scan_history` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`started_by` text NOT NULL,
	`started_by_name` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`issues_found` integer,
	`error` text,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`file_path` text NOT NULL,
	`title` text,
	`paths` text,
	`mode` text DEFAULT 'preview' NOT NULL,
	`allow_comments` integer DEFAULT false NOT NULL,
	`allow_download` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`password_hash` text,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_unique` ON `share_links` (`token`);--> statement-breakpoint
CREATE TABLE `share_views` (
	`id` text PRIMARY KEY NOT NULL,
	`share_token` text NOT NULL,
	`file_path` text NOT NULL,
	`visitor_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`opened_at` integer NOT NULL,
	`last_event_at` integer NOT NULL,
	`max_position_sec` real DEFAULT 0 NOT NULL,
	`total_watch_sec` real DEFAULT 0 NOT NULL,
	`duration_sec` real,
	`completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `traffic_log` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`bytes` integer NOT NULL,
	`source` text NOT NULL,
	`share_token` text,
	`user_id` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trash_items` (
	`id` text PRIMARY KEY NOT NULL,
	`original_path` text NOT NULL,
	`name` text NOT NULL,
	`is_folder` integer DEFAULT false NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`deleted_by` text NOT NULL,
	`deleted_by_name` text NOT NULL,
	`deleted_at` integer NOT NULL,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`name` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`quota_gb` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	`deactivated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);