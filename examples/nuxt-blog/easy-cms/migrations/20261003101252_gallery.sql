-- Easy CMS migration 20261003101252_gallery (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_posts__gallery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`value` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_posts__gallery__parent_id_idx` ON `ecms_posts__gallery` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_posts__gallery_value_idx` ON `ecms_posts__gallery` (`value`);
