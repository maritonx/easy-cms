-- Easy CMS migration 20261005143944_audit (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"action" text,
	"target" text,
	"doc" text,
	"title" text,
	"actor_id" text,
	"actor_email" text,
	"via" text,
	"ip" text,
	"user_agent" text,
	"changes" jsonb,
	"detail" jsonb,
	"signature" text
);

--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_created_at_idx" ON "ecms_audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_action_idx" ON "ecms_audit_logs" USING btree ("action");
--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_target_idx" ON "ecms_audit_logs" USING btree ("target");
--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_doc_idx" ON "ecms_audit_logs" USING btree ("doc");
--> statement-breakpoint
CREATE INDEX "ecms_audit_logs_actor_email_idx" ON "ecms_audit_logs" USING btree ("actor_email");
