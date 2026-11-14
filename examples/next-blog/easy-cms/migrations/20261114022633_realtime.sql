-- Easy CMS migration 20261114022633_realtime (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_realtime_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"collection" text,
	"doc_id" text,
	"event" text,
	"draft" boolean,
	"published" boolean
);

--> statement-breakpoint
CREATE INDEX "ecms_realtime_events_created_at_idx" ON "ecms_realtime_events" USING btree ("created_at");
