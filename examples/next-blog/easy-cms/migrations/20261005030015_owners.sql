-- Easy CMS migration 20261005030015_owners (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_media" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_categories" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_pages" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_forms" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_form_submissions" ADD COLUMN "created_by" integer;
--> statement-breakpoint
ALTER TABLE "ecms_redirects" ADD COLUMN "created_by" integer;
--> statement-breakpoint
CREATE INDEX "ecms_media_created_by_idx" ON "ecms_media" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_categories_created_by_idx" ON "ecms_categories" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_posts_created_by_idx" ON "ecms_posts" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_pages_created_by_idx" ON "ecms_pages" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_forms_created_by_idx" ON "ecms_forms" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_form_submissions_created_by_idx" ON "ecms_form_submissions" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_redirects_created_by_idx" ON "ecms_redirects" USING btree ("created_by");
