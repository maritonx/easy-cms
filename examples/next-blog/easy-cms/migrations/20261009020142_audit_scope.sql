-- Easy CMS migration 20261009020142_audit_scope (postgres)
-- Generated from the config; review before deploying.
ALTER TABLE "ecms_audit_logs" ADD COLUMN "scope" text;
--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_scope_idx" ON "ecms_audit_logs" USING btree ("scope");
