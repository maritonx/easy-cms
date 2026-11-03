-- Easy CMS migration 20261103100628_notify (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_notify_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"channel" text,
	"connection" text,
	"event" text,
	"text" text,
	"state" text,
	"attempts" double precision,
	"next_attempt_at" text,
	"error" text,
	"created_by" integer
);

--> statement-breakpoint
CREATE TABLE "ecms_job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text,
	"last_run_at" text,
	"last_status" text,
	"last_error" text,
	"last_duration_ms" double precision,
	"paused_at" text,
	"paused_by" text,
	"every_override" double precision,
	"at_override" text,
	"changed_by" text,
	"changed_at" text
);

--> statement-breakpoint
CREATE INDEX "ecms_notify_messages_created_at_idx" ON "ecms_notify_messages" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_notify_messages_channel_idx" ON "ecms_notify_messages" USING btree ("channel");
--> statement-breakpoint
CREATE INDEX "ecms_notify_messages_state_idx" ON "ecms_notify_messages" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "ecms_notify_messages_next_attempt_at_idx" ON "ecms_notify_messages" USING btree ("next_attempt_at");
--> statement-breakpoint
CREATE INDEX "ecms_notify_messages_created_by_idx" ON "ecms_notify_messages" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_job_runs_created_at_idx" ON "ecms_job_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_job_runs_name_unique" ON "ecms_job_runs" USING btree ("name");
