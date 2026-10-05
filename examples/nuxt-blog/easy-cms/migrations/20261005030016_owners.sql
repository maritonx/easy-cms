-- Easy CMS migration 20261005030016_owners (sqlite)
-- Generated from the config; review before deploying.
ALTER TABLE `ecms_media` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_media_created_by_idx` ON `ecms_media` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_categories` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_categories_created_by_idx` ON `ecms_categories` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_posts` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_posts_created_by_idx` ON `ecms_posts` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_pages` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_pages_created_by_idx` ON `ecms_pages` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_forms` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_forms_created_by_idx` ON `ecms_forms` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_form_submissions` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_form_submissions_created_by_idx` ON `ecms_form_submissions` (`created_by`);
--> statement-breakpoint
ALTER TABLE `ecms_redirects` ADD `created_by` integer;
--> statement-breakpoint
CREATE INDEX `ecms_redirects_created_by_idx` ON `ecms_redirects` (`created_by`);
