-- Easy CMS migration 20260930052929_nested_pages (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`title__en` text,
	`slug` text,
	`slug__en` text,
	`body` text,
	`body__en` text,
	`parent` integer,
	`path` text,
	`path__en` text,
	`meta_title` text,
	`meta_title__en` text,
	`meta_description` text,
	`meta_description__en` text,
	`meta_image` integer,
	`meta_noindex` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_pages_status_idx` ON `ecms_pages` (`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_created_at_idx` ON `ecms_pages` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_slug_idx` ON `ecms_pages` (`slug`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_slug__en_idx` ON `ecms_pages` (`slug__en`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_parent_idx` ON `ecms_pages` (`parent`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_path_idx` ON `ecms_pages` (`path`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_path__en_idx` ON `ecms_pages` (`path__en`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_meta_image_idx` ON `ecms_pages` (`meta_image`);
--> statement-breakpoint
CREATE TABLE `ecms_pages__breadcrumbs` (
	`id` text PRIMARY KEY NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`_locale` text DEFAULT 'th' NOT NULL,
	`doc` integer,
	`label` text,
	`url` text
);

--> statement-breakpoint
CREATE INDEX `ecms_pages__breadcrumbs__parent_id_idx` ON `ecms_pages__breadcrumbs` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_pages__breadcrumbs__locale_idx` ON `ecms_pages__breadcrumbs` (`_locale`);
--> statement-breakpoint
CREATE INDEX `ecms_pages__breadcrumbs_doc_idx` ON `ecms_pages__breadcrumbs` (`doc`);
--> statement-breakpoint
ALTER TABLE `ecms_redirects` ADD `to_pages` integer;
--> statement-breakpoint
CREATE INDEX `ecms_redirects_to_pages_idx` ON `ecms_redirects` (`to_pages`);
