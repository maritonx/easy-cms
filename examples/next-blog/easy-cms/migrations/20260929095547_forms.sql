-- Easy CMS migration 20260929095547_forms (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"title__en" text,
	"slug" text,
	"fields" jsonb,
	"submit_label" text,
	"submit_label__en" text,
	"confirmation_type" text,
	"confirmation_message" jsonb,
	"confirmation_message__en" jsonb,
	"redirect_url" text
);

--> statement-breakpoint
CREATE TABLE "ecms_forms__emails" (
	"id" text PRIMARY KEY NOT NULL,
	"_parent_id" integer NOT NULL,
	"_order" integer NOT NULL,
	"to" text,
	"cc" text,
	"bcc" text,
	"reply_to" text,
	"from" text,
	"subject" text,
	"subject__en" text,
	"message" jsonb,
	"message__en" jsonb
);

--> statement-breakpoint
CREATE TABLE "ecms_form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"form" integer,
	"summary" text,
	"data" jsonb,
	"locale" text,
	"page" text,
	"rate_key" text
);

--> statement-breakpoint
CREATE TABLE "ecms_email_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"message" text,
	"attempts" double precision,
	"next_attempt_at" text,
	"state" text,
	"error" text
);

--> statement-breakpoint
CREATE INDEX "ecms_forms_status_idx" ON "ecms_forms" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "ecms_forms_created_at_idx" ON "ecms_forms" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_forms_slug_unique" ON "ecms_forms" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_forms__emails__parent_id_idx" ON "ecms_forms__emails" USING btree ("_parent_id");
--> statement-breakpoint
CREATE INDEX "ecms_form_submissions_created_at_idx" ON "ecms_form_submissions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_form_submissions_form_idx" ON "ecms_form_submissions" USING btree ("form");
--> statement-breakpoint
CREATE INDEX "ecms_form_submissions_rate_key_idx" ON "ecms_form_submissions" USING btree ("rate_key");
--> statement-breakpoint
CREATE INDEX "ecms_email_deliveries_created_at_idx" ON "ecms_email_deliveries" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_email_deliveries_next_attempt_at_idx" ON "ecms_email_deliveries" USING btree ("next_attempt_at");
--> statement-breakpoint
CREATE INDEX "ecms_email_deliveries_state_idx" ON "ecms_email_deliveries" USING btree ("state");
