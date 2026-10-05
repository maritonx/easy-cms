-- Easy CMS migration 20261005011135_roles (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text,
	"name" text,
	"permissions" jsonb
);

--> statement-breakpoint
CREATE INDEX "ecms_user_roles_created_at_idx" ON "ecms_user_roles" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_user_roles_key_unique" ON "ecms_user_roles" USING btree ("key");
