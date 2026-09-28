-- Easy CMS migration 20260928073157_api_keys (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text,
	"permissions" jsonb,
	"expires_at" text,
	"prefix" text,
	"user" integer,
	"last_used_at" text,
	"key_hash" text
);

--> statement-breakpoint
CREATE INDEX "ecms_api_keys_created_at_idx" ON "ecms_api_keys" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_api_keys_prefix_idx" ON "ecms_api_keys" USING btree ("prefix");
--> statement-breakpoint
CREATE INDEX "ecms_api_keys_user_idx" ON "ecms_api_keys" USING btree ("user");
