-- Easy CMS migration 20261006002714_init (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"email" text,
	"name" text,
	"role" text,
	"active" boolean,
	"password_hash" text
);

--> statement-breakpoint
CREATE TABLE "ecms_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"filename" text,
	"original_name" text,
	"mime_type" text,
	"filesize" double precision,
	"width" double precision,
	"height" double precision,
	"sizes" jsonb,
	"alt" text,
	"created_by" integer
);

--> statement-breakpoint
CREATE TABLE "ecms_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text,
	"slug" text,
	"created_by" integer
);

--> statement-breakpoint
CREATE TABLE "ecms_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"slug" text,
	"excerpt" text,
	"cover" integer,
	"body" jsonb,
	"category" integer,
	"author" integer,
	"published_at" text,
	"meta_title" text,
	"meta_description" text,
	"meta_image" integer,
	"meta_noindex" boolean,
	"created_by" integer
);

--> statement-breakpoint
CREATE TABLE "ecms_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"token_hash" text,
	"user" integer,
	"expires_at" text
);

--> statement-breakpoint
CREATE TABLE "ecms_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text
);

--> statement-breakpoint
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
CREATE TABLE "ecms_database_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"state" text,
	"trigger" text,
	"filename" text,
	"size" double precision,
	"started_at" text,
	"finished_at" text,
	"error" text,
	"author" text,
	"downloaded_by" text,
	"downloaded_at" text
);

--> statement-breakpoint
CREATE TABLE "ecms_user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text,
	"name" text,
	"permissions" jsonb
);

--> statement-breakpoint
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
CREATE TABLE "ecms_globals" (
	"slug" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"status" text,
	"updated_at" text NOT NULL
);

--> statement-breakpoint
CREATE INDEX "ecms_users_created_at_idx" ON "ecms_users" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_users_email_unique" ON "ecms_users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "ecms_media_created_at_idx" ON "ecms_media" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_media_filename_unique" ON "ecms_media" USING btree ("filename");
--> statement-breakpoint
CREATE INDEX "ecms_media_created_by_idx" ON "ecms_media" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_categories_created_at_idx" ON "ecms_categories" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_categories_slug_unique" ON "ecms_categories" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_categories_created_by_idx" ON "ecms_categories" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_posts_status_idx" ON "ecms_posts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "ecms_posts_created_at_idx" ON "ecms_posts" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_posts_slug_unique" ON "ecms_posts" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_posts_cover_idx" ON "ecms_posts" USING btree ("cover");
--> statement-breakpoint
CREATE INDEX "ecms_posts_category_idx" ON "ecms_posts" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "ecms_posts_author_idx" ON "ecms_posts" USING btree ("author");
--> statement-breakpoint
CREATE INDEX "ecms_posts_meta_image_idx" ON "ecms_posts" USING btree ("meta_image");
--> statement-breakpoint
CREATE INDEX "ecms_posts_created_by_idx" ON "ecms_posts" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_created_at_idx" ON "ecms_sessions" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_sessions_token_hash_unique" ON "ecms_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_user_idx" ON "ecms_sessions" USING btree ("user");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_expires_at_idx" ON "ecms_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "ecms_login_attempts_created_at_idx" ON "ecms_login_attempts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_login_attempts_key_idx" ON "ecms_login_attempts" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_created_at_idx" ON "ecms_document_versions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_parent_idx" ON "ecms_document_versions" USING btree ("parent");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_doc_idx" ON "ecms_document_versions" USING btree ("doc");
--> statement-breakpoint
CREATE INDEX "ecms_document_versions_latest_idx" ON "ecms_document_versions" USING btree ("latest");
--> statement-breakpoint
CREATE INDEX "ecms_database_backups_created_at_idx" ON "ecms_database_backups" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_database_backups_state_idx" ON "ecms_database_backups" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "ecms_database_backups_started_at_idx" ON "ecms_database_backups" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX "ecms_user_roles_created_at_idx" ON "ecms_user_roles" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_user_roles_key_unique" ON "ecms_user_roles" USING btree ("key");
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
