-- Easy CMS migration 20260929095546_forms (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`title__en` text,
	`slug` text,
	`fields` text,
	`submit_label` text,
	`submit_label__en` text,
	`confirmation_type` text,
	`confirmation_message` text,
	`confirmation_message__en` text,
	`redirect_url` text
);

--> statement-breakpoint
CREATE INDEX `ecms_forms_status_idx` ON `ecms_forms` (`status`);
--> statement-breakpoint
CREATE INDEX `ecms_forms_created_at_idx` ON `ecms_forms` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_forms_slug_unique` ON `ecms_forms` (`slug`);
--> statement-breakpoint
CREATE TABLE `ecms_forms__emails` (
	`id` text PRIMARY KEY NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`to` text,
	`cc` text,
	`bcc` text,
	`reply_to` text,
	`from` text,
	`subject` text,
	`subject__en` text,
	`message` text,
	`message__en` text
);

--> statement-breakpoint
CREATE INDEX `ecms_forms__emails__parent_id_idx` ON `ecms_forms__emails` (`_parent_id`);
--> statement-breakpoint
CREATE TABLE `ecms_form_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`form` integer,
	`summary` text,
	`data` text,
	`locale` text,
	`page` text,
	`rate_key` text
);

--> statement-breakpoint
CREATE INDEX `ecms_form_submissions_created_at_idx` ON `ecms_form_submissions` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_form_submissions_form_idx` ON `ecms_form_submissions` (`form`);
--> statement-breakpoint
CREATE INDEX `ecms_form_submissions_rate_key_idx` ON `ecms_form_submissions` (`rate_key`);
--> statement-breakpoint
CREATE TABLE `ecms_email_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`message` text,
	`attempts` real,
	`next_attempt_at` text,
	`state` text,
	`error` text
);

--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_created_at_idx` ON `ecms_email_deliveries` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_next_attempt_at_idx` ON `ecms_email_deliveries` (`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_state_idx` ON `ecms_email_deliveries` (`state`);
