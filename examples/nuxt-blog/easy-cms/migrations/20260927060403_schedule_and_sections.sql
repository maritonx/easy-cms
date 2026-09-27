-- Easy CMS migration 20260927060403_schedule_and_sections (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_scheduled_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`parent` text,
	`doc` real,
	`action` text,
	`run_at` text,
	`state` text,
	`error` text,
	`author` real
);

--> statement-breakpoint
CREATE INDEX `ecms_scheduled_jobs_created_at_idx` ON `ecms_scheduled_jobs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_scheduled_jobs_parent_idx` ON `ecms_scheduled_jobs` (`parent`);
--> statement-breakpoint
CREATE INDEX `ecms_scheduled_jobs_doc_idx` ON `ecms_scheduled_jobs` (`doc`);
--> statement-breakpoint
CREATE INDEX `ecms_scheduled_jobs_run_at_idx` ON `ecms_scheduled_jobs` (`run_at`);
--> statement-breakpoint
CREATE INDEX `ecms_scheduled_jobs_state_idx` ON `ecms_scheduled_jobs` (`state`);
--> statement-breakpoint
ALTER TABLE `ecms_posts` ADD `sections` text;
