-- Easy CMS migration 20261111102443_sign_in_admin (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_sessions" ADD COLUMN "method" text;
--> statement-breakpoint
CREATE INDEX "ecms_sessions_method_idx" ON "ecms_sessions" USING btree ("method");
