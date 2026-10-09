-- Easy CMS migration 20261009004431_unique_within (sqlite)
-- Generated from the config; review before deploying.
CREATE UNIQUE INDEX `ecms_pages_parent_slug_unique` ON `ecms_pages` (`parent`,`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_pages_parent_slug__en_unique` ON `ecms_pages` (`parent`,`slug__en`);
