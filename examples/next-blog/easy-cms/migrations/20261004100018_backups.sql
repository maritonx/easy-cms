-- Easy CMS migration 20261004100018_backups (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_database_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"state" text,
	"trigger" text,
	"filename" text,
	"size" double precision,
	"started_at" text,
	"finished_at" text,
	"error" text,
	"author" text,
	"downloaded_by" text,
	"downloaded_at" text
);

--> statement-breakpoint
CREATE INDEX "ecms_database_backups_created_at_idx" ON "ecms_database_backups" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_database_backups_state_idx" ON "ecms_database_backups" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "ecms_database_backups_started_at_idx" ON "ecms_database_backups" USING btree ("started_at");
