-- Easy CMS migration 20261109110902_email_log (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"to" text,
	"cc" text,
	"bcc" double precision,
	"subject" text,
	"tag" text,
	"state" text,
	"attempts" double precision,
	"error" text,
	"adapter" text,
	"sent_at" text
);

--> statement-breakpoint
CREATE INDEX "ecms_email_log_created_at_idx" ON "ecms_email_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_email_log_tag_idx" ON "ecms_email_log" USING btree ("tag");
--> statement-breakpoint
CREATE INDEX "ecms_email_log_state_idx" ON "ecms_email_log" USING btree ("state");
