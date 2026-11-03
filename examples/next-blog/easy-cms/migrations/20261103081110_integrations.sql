-- Easy CMS migration 20261103081110_integrations (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"kind" text,
	"integration" text,
	"name" text,
	"is_default" boolean,
	"values" jsonb,
	"secret" text,
	"account" text,
	"last_used_at" text,
	"last_error" text,
	"enabled" boolean
);

--> statement-breakpoint
CREATE INDEX "ecms_connections_created_at_idx" ON "ecms_connections" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_connections_integration_idx" ON "ecms_connections" USING btree ("integration");
