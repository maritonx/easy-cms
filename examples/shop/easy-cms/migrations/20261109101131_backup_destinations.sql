-- Easy CMS migration 20261109101131_backup_destinations (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_admin_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`key` text,
	`value` text
);

--> statement-breakpoint
CREATE INDEX `ecms_admin_settings_created_at_idx` ON `ecms_admin_settings` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_admin_settings_key_unique` ON `ecms_admin_settings` (`key`);
--> statement-breakpoint
ALTER TABLE `ecms_database_backups` ADD `copies` text;
