-- Easy CMS migration 20261030125841_bulk_operations (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_bulk_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"collection" text,
	"action" text,
	"query" jsonb,
	"folder" text,
	"transfer_to" text,
	"user" text,
	"state" text,
	"total" double precision,
	"done" double precision,
	"skipped" double precision,
	"failed" double precision,
	"after" jsonb,
	"problems" jsonb,
	"error" text,
	"lease_until" text,
	"finished_at" text
);

--> statement-breakpoint
CREATE INDEX "ecms_bulk_operations_created_at_idx" ON "ecms_bulk_operations" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_bulk_operations_user_idx" ON "ecms_bulk_operations" USING btree ("user");
--> statement-breakpoint
CREATE INDEX "ecms_bulk_operations_state_idx" ON "ecms_bulk_operations" USING btree ("state");
