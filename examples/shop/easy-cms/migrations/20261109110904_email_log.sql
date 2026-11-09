-- Easy CMS migration 20261109110904_email_log (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_email_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`to` text,
	`cc` text,
	`bcc` real,
	`subject` text,
	`tag` text,
	`state` text,
	`attempts` real,
	`error` text,
	`adapter` text,
	`sent_at` text
);

--> statement-breakpoint
CREATE INDEX `ecms_email_log_created_at_idx` ON `ecms_email_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_email_log_tag_idx` ON `ecms_email_log` (`tag`);
--> statement-breakpoint
CREATE INDEX `ecms_email_log_state_idx` ON `ecms_email_log` (`state`);
