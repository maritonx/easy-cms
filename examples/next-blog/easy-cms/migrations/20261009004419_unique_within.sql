-- Easy CMS migration 20261009004419_unique_within (postgres)
-- Generated from the config; review before deploying.
CREATE UNIQUE INDEX "ecms_pages_parent_slug_unique" ON "ecms_pages" USING btree ("parent","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_pages_parent_slug__en_unique" ON "ecms_pages" USING btree ("parent","slug__en");
