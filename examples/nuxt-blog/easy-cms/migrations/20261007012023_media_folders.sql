-- Easy CMS migration 20261007012023_media_folders (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_media_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text,
	`parent` integer,
	`permissions` text,
	`created_by` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_media_folders_created_at_idx` ON `ecms_media_folders` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_media_folders_parent_idx` ON `ecms_media_folders` (`parent`);
--> statement-breakpoint
CREATE INDEX `ecms_media_folders_created_by_idx` ON `ecms_media_folders` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_media` ADD `folder` integer;
--> statement-breakpoint
CREATE INDEX `ecms_media_folder_idx` ON `ecms_media` (`folder`);
