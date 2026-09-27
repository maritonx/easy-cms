-- Easy CMS migration 20260927041914_add_versions (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_document_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`parent` text,
	`doc` real,
	`status` text,
	`latest` integer,
	`author` real,
	`snapshot` text
);

--> statement-breakpoint
CREATE INDEX `ecms_document_versions_created_at_idx` ON `ecms_document_versions` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_document_versions_parent_idx` ON `ecms_document_versions` (`parent`);
--> statement-breakpoint
CREATE INDEX `ecms_document_versions_doc_idx` ON `ecms_document_versions` (`doc`);
--> statement-breakpoint
CREATE INDEX `ecms_document_versions_latest_idx` ON `ecms_document_versions` (`latest`);
