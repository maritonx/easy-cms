-- Easy CMS migration 20260928093435_seo_noindex (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_posts" ADD COLUMN "meta_noindex" boolean;
