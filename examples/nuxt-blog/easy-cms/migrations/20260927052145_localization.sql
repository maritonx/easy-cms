-- Easy CMS migration 20260927052145_localization (sqlite)
-- Generated from the config; review before deploying.
ALTER TABLE `ecms_posts` ADD `title__en` text;
--> statement-breakpoint
ALTER TABLE `ecms_posts` ADD `excerpt__en` text;
--> statement-breakpoint
ALTER TABLE `ecms_posts` ADD `body__en` text;
