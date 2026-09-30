-- Easy CMS migration 20260930052930_nested_pages (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"title__en" text,
	"slug" text,
	"slug__en" text,
	"body" jsonb,
	"body__en" jsonb,
	"parent" integer,
	"path" text,
	"path__en" text,
	"meta_title" text,
	"meta_title__en" text,
	"meta_description" text,
	"meta_description__en" text,
	"meta_image" integer,
	"meta_noindex" boolean
);

--> statement-breakpoint
CREATE TABLE "ecms_pages__breadcrumbs" (
	"id" text PRIMARY KEY NOT NULL,
	"_parent_id" integer NOT NULL,
	"_order" integer NOT NULL,
	"_locale" text DEFAULT 'th' NOT NULL,
	"doc" integer,
	"label" text,
	"url" text
);

--> statement-breakpoint
ALTER TABLE "ecms_redirects" ADD COLUMN "to_pages" integer;
--> statement-breakpoint
CREATE INDEX "ecms_pages_status_idx" ON "ecms_pages" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "ecms_pages_created_at_idx" ON "ecms_pages" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_pages_slug_idx" ON "ecms_pages" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_pages_slug__en_idx" ON "ecms_pages" USING btree ("slug__en");
--> statement-breakpoint
CREATE INDEX "ecms_pages_parent_idx" ON "ecms_pages" USING btree ("parent");
--> statement-breakpoint
CREATE INDEX "ecms_pages_path_idx" ON "ecms_pages" USING btree ("path");
--> statement-breakpoint
CREATE INDEX "ecms_pages_path__en_idx" ON "ecms_pages" USING btree ("path__en");
--> statement-breakpoint
CREATE INDEX "ecms_pages_meta_image_idx" ON "ecms_pages" USING btree ("meta_image");
--> statement-breakpoint
CREATE INDEX "ecms_pages__breadcrumbs__parent_id_idx" ON "ecms_pages__breadcrumbs" USING btree ("_parent_id");
--> statement-breakpoint
CREATE INDEX "ecms_pages__breadcrumbs__locale_idx" ON "ecms_pages__breadcrumbs" USING btree ("_locale");
--> statement-breakpoint
CREATE INDEX "ecms_pages__breadcrumbs_doc_idx" ON "ecms_pages__breadcrumbs" USING btree ("doc");
--> statement-breakpoint
CREATE INDEX "ecms_redirects_to_pages_idx" ON "ecms_redirects" USING btree ("to_pages");
