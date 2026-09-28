-- Easy CMS migration 20260928073156_api_keys (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text,
	`permissions` text,
	`expires_at` text,
	`prefix` text,
	`user` integer,
	`last_used_at` text,
	`key_hash` text
);

--> statement-breakpoint
CREATE INDEX `ecms_api_keys_created_at_idx` ON `ecms_api_keys` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_api_keys_prefix_idx` ON `ecms_api_keys` (`prefix`);
--> statement-breakpoint
CREATE INDEX `ecms_api_keys_user_idx` ON `ecms_api_keys` (`user`);
