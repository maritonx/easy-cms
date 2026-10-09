-- Easy CMS migration 20261009020143_audit_scope (sqlite)
-- Generated from the config; review before deploying.
ALTER TABLE `ecms_audit_logs` ADD `scope` text;
--> statement-breakpoint
CREATE INDEX `ecms_audit_logs_scope_idx` ON `ecms_audit_logs` (`scope`);
