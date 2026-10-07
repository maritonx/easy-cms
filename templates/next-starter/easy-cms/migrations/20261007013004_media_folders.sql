-- Easy CMS migration 20261007013004_media_folders (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_media_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text,
	"parent" integer,
	"permissions" jsonb,
	"created_by" integer
);

--> statement-breakpoint
ALTER TABLE "ecms_media" ADD COLUMN "folder" integer;
--> statement-breakpoint
CREATE INDEX "ecms_media_folders_created_at_idx" ON "ecms_media_folders" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_media_folders_parent_idx" ON "ecms_media_folders" USING btree ("parent");
--> statement-breakpoint
CREATE INDEX "ecms_media_folders_created_by_idx" ON "ecms_media_folders" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_media_folder_idx" ON "ecms_media" USING btree ("folder");
