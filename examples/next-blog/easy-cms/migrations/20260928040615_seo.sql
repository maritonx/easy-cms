-- Easy CMS migration 20260928040615_seo (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_posts" ADD COLUMN "meta_title" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "meta_title__en" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "meta_description" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "meta_description__en" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "meta_image" integer;
--> statement-breakpoint
CREATE INDEX "ecms_posts_meta_image_idx" ON "ecms_posts" USING btree ("meta_image");
