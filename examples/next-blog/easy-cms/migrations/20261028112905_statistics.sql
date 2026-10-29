-- Easy CMS migration 20261028112905_statistics (postgres)
-- Generated from the config; review before deploying.
CREATE STATISTICS IF NOT EXISTS "ecms_posts_cover_status_stats" (mcv) ON "cover", "status" FROM "ecms_posts"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_posts_category_status_stats" (mcv) ON "category", "status" FROM "ecms_posts"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_posts_author_status_stats" (mcv) ON "author", "status" FROM "ecms_posts"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_posts_meta_image_status_stats" (mcv) ON "meta_image", "status" FROM "ecms_posts"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_posts_created_by_status_stats" (mcv) ON "created_by", "status" FROM "ecms_posts"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_pages_parent_status_stats" (mcv) ON "parent", "status" FROM "ecms_pages"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_pages_path_status_stats" (mcv) ON "path", "status" FROM "ecms_pages"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_pages_path__en_status_stats" (mcv) ON "path__en", "status" FROM "ecms_pages"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_pages_meta_image_status_stats" (mcv) ON "meta_image", "status" FROM "ecms_pages"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_pages_created_by_status_stats" (mcv) ON "created_by", "status" FROM "ecms_pages"
--> statement-breakpoint
CREATE STATISTICS IF NOT EXISTS "ecms_forms_created_by_status_stats" (mcv) ON "created_by", "status" FROM "ecms_forms"
--> statement-breakpoint
ANALYZE "ecms_posts"
--> statement-breakpoint
ANALYZE "ecms_pages"
--> statement-breakpoint
ANALYZE "ecms_forms"
