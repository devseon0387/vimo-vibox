ALTER TABLE `share_links` ADD `kind` text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `include_feedback` integer DEFAULT false NOT NULL;