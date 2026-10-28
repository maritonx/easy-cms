-- Easy CMS migration 20261028095409_draft_indexes (sqlite)
-- Generated from the config; review before deploying.
CREATE INDEX `ecms_posts_cover_status_idx` ON `ecms_posts` (`cover`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_category_status_idx` ON `ecms_posts` (`category`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_author_status_idx` ON `ecms_posts` (`author`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_meta_image_status_idx` ON `ecms_posts` (`meta_image`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_created_by_status_idx` ON `ecms_posts` (`created_by`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_parent_status_idx` ON `ecms_pages` (`parent`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_path_status_idx` ON `ecms_pages` (`path`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_path__en_status_idx` ON `ecms_pages` (`path__en`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_meta_image_status_idx` ON `ecms_pages` (`meta_image`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_pages_created_by_status_idx` ON `ecms_pages` (`created_by`,`status`);
--> statement-breakpoint
CREATE INDEX `ecms_forms_created_by_status_idx` ON `ecms_forms` (`created_by`,`status`);
--> statement-breakpoint
DROP INDEX `ecms_posts_cover_idx`;
--> statement-breakpoint
DROP INDEX `ecms_posts_category_idx`;
--> statement-breakpoint
DROP INDEX `ecms_posts_author_idx`;
--> statement-breakpoint
DROP INDEX `ecms_posts_meta_image_idx`;
--> statement-breakpoint
DROP INDEX `ecms_posts_created_by_idx`;
--> statement-breakpoint
DROP INDEX `ecms_pages_parent_idx`;
--> statement-breakpoint
DROP INDEX `ecms_pages_path_idx`;
--> statement-breakpoint
DROP INDEX `ecms_pages_path__en_idx`;
--> statement-breakpoint
DROP INDEX `ecms_pages_meta_image_idx`;
--> statement-breakpoint
DROP INDEX `ecms_pages_created_by_idx`;
--> statement-breakpoint
DROP INDEX `ecms_forms_created_by_idx`;
