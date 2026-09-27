-- Easy CMS migration 20260927060405_schedule_and_sections (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"parent" text,
	"doc" double precision,
	"action" text,
	"run_at" text,
	"state" text,
	"error" text,
	"author" double precision
);

--> statement-breakpoint
ALTER TABLE "ecms_posts" ADD COLUMN "sections" jsonb;
--> statement-breakpoint
CREATE INDEX "ecms_scheduled_jobs_created_at_idx" ON "ecms_scheduled_jobs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_scheduled_jobs_parent_idx" ON "ecms_scheduled_jobs" USING btree ("parent");
--> statement-breakpoint
CREATE INDEX "ecms_scheduled_jobs_doc_idx" ON "ecms_scheduled_jobs" USING btree ("doc");
--> statement-breakpoint
CREATE INDEX "ecms_scheduled_jobs_run_at_idx" ON "ecms_scheduled_jobs" USING btree ("run_at");
--> statement-breakpoint
CREATE INDEX "ecms_scheduled_jobs_state_idx" ON "ecms_scheduled_jobs" USING btree ("state");
