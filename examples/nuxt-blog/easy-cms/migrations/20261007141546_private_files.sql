-- Easy CMS migration 20261007141546_private_files (sqlite)
-- Generated from the config; review before deploying.
ALTER TABLE `ecms_media` ADD `private` integer;
--> statement-breakpoint
CREATE INDEX `ecms_media_private_idx` ON `ecms_media` (`private`);
--> statement-breakpoint
ALTER TABLE `ecms_media_folders` ADD `key` text;
--> statement-breakpoint
ALTER TABLE `ecms_media_folders` ADD `private` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_media_folders_key_unique` ON `ecms_media_folders` (`key`);
