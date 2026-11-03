-- Easy CMS migration 20261103050142_saved_views (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"collection" text,
	"user" text,
	"kind" text,
	"name" text,
	"shared" boolean,
	"state" jsonb,
	"target" text
);

--> statement-breakpoint
CREATE INDEX "ecms_saved_views_created_at_idx" ON "ecms_saved_views" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_saved_views_collection_idx" ON "ecms_saved_views" USING btree ("collection");
--> statement-breakpoint
CREATE INDEX "ecms_saved_views_user_idx" ON "ecms_saved_views" USING btree ("user");
