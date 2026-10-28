-- Easy CMS migration 20261028095413_draft_indexes (sqlite)
-- Generated from the config; review before deploying.
CREATE INDEX `ecms_products_sku_status_idx` ON `ecms_products` (`sku`,`status`);
--> statement-breakpoint
DROP INDEX `ecms_products_sku_idx`;
