-- Easy CMS migration 20261004041910_category_color (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_categories" ADD COLUMN "color" text;
