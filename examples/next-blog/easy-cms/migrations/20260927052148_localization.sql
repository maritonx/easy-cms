-- Easy CMS migration 20260927052148_localization (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_posts" ADD COLUMN "title__en" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "excerpt__en" text;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "body__en" jsonb;
