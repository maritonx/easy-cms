-- Easy CMS migration 20261010062436_order_expiry (sqlite)
-- Generated from the config; review before deploying.
ALTER TABLE `ecms_orders` ADD `expires_at` text;
