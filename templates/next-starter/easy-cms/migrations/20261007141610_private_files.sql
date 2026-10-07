-- Easy CMS migration 20261007141610_private_files (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_media" ADD COLUMN "private" boolean;
--> statement-breakpoint
ALTER TABLE "ecms_media_folders" ADD COLUMN "key" text;
--> statement-breakpoint
ALTER TABLE "ecms_media_folders" ADD COLUMN "private" boolean;
--> statement-breakpoint
CREATE INDEX "ecms_media_private_idx" ON "ecms_media" USING btree ("private");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_media_folders_key_unique" ON "ecms_media_folders" USING btree ("key");
