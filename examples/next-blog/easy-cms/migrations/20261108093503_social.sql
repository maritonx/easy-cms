-- Easy CMS migration 20261108093503_social (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"title" text,
	"text" text,
	"link" text,
	"image" integer,
	"source" integer,
	"delivery" jsonb,
	"next_at" text,
	"created_by" integer
);

--> statement-breakpoint
CREATE TABLE "ecms_social_posts__channels" (
	"id" text PRIMARY KEY NOT NULL,
	"_parent_id" integer NOT NULL,
	"_order" integer NOT NULL,
	"connection" text,
	"text" text
);

--> statement-breakpoint
CREATE INDEX "ecms_social_posts_created_at_idx" ON "ecms_social_posts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_social_posts_image_idx" ON "ecms_social_posts" USING btree ("image");
--> statement-breakpoint
CREATE INDEX "ecms_social_posts_source_idx" ON "ecms_social_posts" USING btree ("source");
--> statement-breakpoint
CREATE INDEX "ecms_social_posts_next_at_idx" ON "ecms_social_posts" USING btree ("next_at");
--> statement-breakpoint
CREATE INDEX "ecms_social_posts_created_by_idx" ON "ecms_social_posts" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_social_posts__channels__parent_id_idx" ON "ecms_social_posts__channels" USING btree ("_parent_id");
