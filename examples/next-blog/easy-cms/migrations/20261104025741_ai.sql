-- Easy CMS migration 20261104025741_ai (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"user" text,
	"feature" text,
	"integration" text,
	"connection" text,
	"input" double precision,
	"output" double precision,
	"ok" boolean,
	"error" text,
	"about" text
);

--> statement-breakpoint
CREATE INDEX "ecms_ai_usage_created_at_idx" ON "ecms_ai_usage" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_ai_usage_user_idx" ON "ecms_ai_usage" USING btree ("user");
