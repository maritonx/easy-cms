-- Easy CMS migration 20261123105048_ai_usage_detail (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_ai_usage" ADD COLUMN "attempts" double precision;
--> statement-breakpoint
ALTER TABLE "ecms_ai_usage" ADD COLUMN "image_bytes" double precision;
--> statement-breakpoint
ALTER TABLE "ecms_ai_usage" ADD COLUMN "prompt_hash" text;
