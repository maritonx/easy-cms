-- Easy CMS migration 20261005011136_roles (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`key` text,
	`name` text,
	`permissions` text
);

--> statement-breakpoint
CREATE INDEX `ecms_user_roles_created_at_idx` ON `ecms_user_roles` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_user_roles_key_unique` ON `ecms_user_roles` (`key`);
