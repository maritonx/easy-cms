-- Easy CMS migration 20260928103628_redirects (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"from" text,
	"to" text,
	"to_posts" integer,
	"locale" text,
	"type" text
);

--> statement-breakpoint
CREATE INDEX "ecms_redirects_created_at_idx" ON "ecms_redirects" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_redirects_from_unique" ON "ecms_redirects" USING btree ("from");
--> statement-breakpoint
CREATE INDEX "ecms_redirects_to_posts_idx" ON "ecms_redirects" USING btree ("to_posts");
