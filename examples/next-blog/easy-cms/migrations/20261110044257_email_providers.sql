-- Easy CMS migration 20261110044257_email_providers (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"address" text,
	"reason" text,
	"detail" text,
	"source" text
);

--> statement-breakpoint
ALTER TABLE "ecms_email_log" ADD COLUMN "provider_id" text;
--> statement-breakpoint
ALTER TABLE "ecms_email_log" ADD COLUMN "delivery" text;
--> statement-breakpoint
ALTER TABLE "ecms_email_log" ADD COLUMN "delivery_at" text;
--> statement-breakpoint
CREATE INDEX "ecms_email_suppressions_created_at_idx" ON "ecms_email_suppressions" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_email_suppressions_address_unique" ON "ecms_email_suppressions" USING btree ("address");
--> statement-breakpoint
CREATE INDEX "ecms_email_log_provider_id_idx" ON "ecms_email_log" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX "ecms_email_log_delivery_idx" ON "ecms_email_log" USING btree ("delivery");
