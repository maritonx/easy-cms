-- Easy CMS migration 20260927041906_add_versions (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"parent" text,
	"doc" double precision,
	"status" text,
	"latest" boolean,
	"author" double precision,
	"snapshot" jsonb
);

--> statement-breakpoint
CREATE INDEX "ecms_document_versions_created_at_idx" ON "ecms_document_versions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_parent_idx" ON "ecms_document_versions" USING btree ("parent");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_doc_idx" ON "ecms_document_versions" USING btree ("doc");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_latest_idx" ON "ecms_document_versions" USING btree ("latest");
