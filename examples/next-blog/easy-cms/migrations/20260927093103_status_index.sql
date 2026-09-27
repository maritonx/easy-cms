-- Easy CMS migration 20260927093103_status_index (postgres)
-- Generated from the config; review before deploying.
CREATE INDEX "ecms_posts_status_idx" ON "ecms_posts" USING btree ("status");
