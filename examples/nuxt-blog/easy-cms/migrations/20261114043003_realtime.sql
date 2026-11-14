-- Easy CMS migration 20261114043003_realtime (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_realtime_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`collection` text,
	`doc_id` text,
	`event` text,
	`draft` integer,
	`published` integer,
	`before` text
);

--> statement-breakpoint
CREATE INDEX `ecms_realtime_events_created_at_idx` ON `ecms_realtime_events` (`created_at`);
