-- Easy CMS migration 20261018063225_job_runs (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text,
	`last_run_at` text,
	`last_status` text,
	`last_error` text,
	`last_duration_ms` real
);

--> statement-breakpoint
CREATE INDEX `ecms_job_runs_created_at_idx` ON `ecms_job_runs` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_job_runs_name_unique` ON `ecms_job_runs` (`name`);
