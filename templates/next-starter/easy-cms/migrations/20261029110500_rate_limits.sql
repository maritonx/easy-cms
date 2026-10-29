-- Easy CMS migration 20261029110500_rate_limits (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text,
	"count" double precision,
	"expires_at" text
);

--> statement-breakpoint
CREATE INDEX "ecms_rate_limits_created_at_idx" ON "ecms_rate_limits" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_rate_limits_key_unique" ON "ecms_rate_limits" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "ecms_rate_limits_expires_at_idx" ON "ecms_rate_limits" USING btree ("expires_at");
