-- Easy CMS migration 20261028095412_draft_indexes (postgres)
-- Generated from the config; review before deploying.
CREATE INDEX "ecms_posts_cover_status_idx" ON "ecms_posts" USING btree ("cover","status");
--> statement-breakpoint
CREATE INDEX "ecms_posts_category_status_idx" ON "ecms_posts" USING btree ("category","status");
--> statement-breakpoint
CREATE INDEX "ecms_posts_author_status_idx" ON "ecms_posts" USING btree ("author","status");
--> statement-breakpoint
CREATE INDEX "ecms_posts_meta_image_status_idx" ON "ecms_posts" USING btree ("meta_image","status");
--> statement-breakpoint
CREATE INDEX "ecms_posts_created_by_status_idx" ON "ecms_posts" USING btree ("created_by","status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_parent_status_idx" ON "ecms_pages" USING btree ("parent","status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_path_status_idx" ON "ecms_pages" USING btree ("path","status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_path__en_status_idx" ON "ecms_pages" USING btree ("path__en","status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_meta_image_status_idx" ON "ecms_pages" USING btree ("meta_image","status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_created_by_status_idx" ON "ecms_pages" USING btree ("created_by","status");
--> statement-breakpoint
CREATE INDEX "ecms_forms_created_by_status_idx" ON "ecms_forms" USING btree ("created_by","status");
--> statement-breakpoint
DROP INDEX "ecms_posts_cover_idx";
--> statement-breakpoint
DROP INDEX "ecms_posts_category_idx";
--> statement-breakpoint
DROP INDEX "ecms_posts_author_idx";
--> statement-breakpoint
DROP INDEX "ecms_posts_meta_image_idx";
--> statement-breakpoint
DROP INDEX "ecms_posts_created_by_idx";
--> statement-breakpoint
DROP INDEX "ecms_pages_parent_idx";
--> statement-breakpoint
DROP INDEX "ecms_pages_path_idx";
--> statement-breakpoint
DROP INDEX "ecms_pages_path__en_idx";
--> statement-breakpoint
DROP INDEX "ecms_pages_meta_image_idx";
--> statement-breakpoint
DROP INDEX "ecms_pages_created_by_idx";
--> statement-breakpoint
DROP INDEX "ecms_forms_created_by_idx";
