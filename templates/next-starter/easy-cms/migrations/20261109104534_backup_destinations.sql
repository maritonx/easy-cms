-- Easy CMS migration 20261109104534_backup_destinations (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_admin_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text,
	"value" jsonb
);

--> statement-breakpoint
ALTER TABLE "ecms_database_backups" ADD COLUMN "copies" jsonb;
--> statement-breakpoint
CREATE INDEX "ecms_admin_settings_created_at_idx" ON "ecms_admin_settings" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_admin_settings_key_unique" ON "ecms_admin_settings" USING btree ("key");
