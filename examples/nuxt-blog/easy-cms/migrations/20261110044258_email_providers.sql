-- Easy CMS migration 20261110044258_email_providers (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_email_suppressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`address` text,
	`reason` text,
	`detail` text,
	`source` text
);

--> statement-breakpoint
CREATE INDEX `ecms_email_suppressions_created_at_idx` ON `ecms_email_suppressions` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_email_suppressions_address_unique` ON `ecms_email_suppressions` (`address`);
--> statement-breakpoint
ALTER TABLE `ecms_email_log` ADD `provider_id` text;
--> statement-breakpoint
ALTER TABLE `ecms_email_log` ADD `delivery` text;
--> statement-breakpoint
ALTER TABLE `ecms_email_log` ADD `delivery_at` text;
--> statement-breakpoint
CREATE INDEX `ecms_email_log_provider_id_idx` ON `ecms_email_log` (`provider_id`);
--> statement-breakpoint
CREATE INDEX `ecms_email_log_delivery_idx` ON `ecms_email_log` (`delivery`);
