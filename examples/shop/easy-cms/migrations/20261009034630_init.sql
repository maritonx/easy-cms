-- Easy CMS migration 20261009034630_init (sqlite)
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`email` text,
	`name` text,
	`role` text,
	`active` integer,
	`email_verified` integer,
	`password_hash` text
);

--> statement-breakpoint
CREATE INDEX `ecms_users_created_at_idx` ON `ecms_users` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_users_email_unique` ON `ecms_users` (`email`);
--> statement-breakpoint
CREATE TABLE `ecms_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`filename` text,
	`original_name` text,
	`mime_type` text,
	`filesize` real,
	`width` real,
	`height` real,
	`sizes` text,
	`alt` text
);

--> statement-breakpoint
CREATE INDEX `ecms_media_created_at_idx` ON `ecms_media` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_media_filename_unique` ON `ecms_media` (`filename`);
--> statement-breakpoint
CREATE TABLE `ecms_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`slug` text,
	`description` text,
	`price_in_thb` real,
	`price_in_usd` real,
	`sku` text,
	`inventory` real
);

--> statement-breakpoint
CREATE INDEX `ecms_products_status_idx` ON `ecms_products` (`status`);
--> statement-breakpoint
CREATE INDEX `ecms_products_created_at_idx` ON `ecms_products` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_products_slug_unique` ON `ecms_products` (`slug`);
--> statement-breakpoint
CREATE INDEX `ecms_products_sku_idx` ON `ecms_products` (`sku`);
--> statement-breakpoint
CREATE TABLE `ecms_products__images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`value` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_products__images__parent_id_idx` ON `ecms_products__images` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_products__images_value_idx` ON `ecms_products__images` (`value`);
--> statement-breakpoint
CREATE TABLE `ecms_products__variant_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`value` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_products__variant_types__parent_id_idx` ON `ecms_products__variant_types` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_products__variant_types_value_idx` ON `ecms_products__variant_types` (`value`);
--> statement-breakpoint
CREATE TABLE `ecms_variant_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text
);

--> statement-breakpoint
CREATE INDEX `ecms_variant_types_created_at_idx` ON `ecms_variant_types` (`created_at`);
--> statement-breakpoint
CREATE TABLE `ecms_variant_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`type` integer,
	`label` text
);

--> statement-breakpoint
CREATE INDEX `ecms_variant_options_created_at_idx` ON `ecms_variant_options` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_variant_options_type_idx` ON `ecms_variant_options` (`type`);
--> statement-breakpoint
CREATE TABLE `ecms_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`product` integer,
	`title` text,
	`price_in_thb` real,
	`price_in_usd` real,
	`sku` text,
	`inventory` real
);

--> statement-breakpoint
CREATE INDEX `ecms_variants_created_at_idx` ON `ecms_variants` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_variants_product_idx` ON `ecms_variants` (`product`);
--> statement-breakpoint
CREATE INDEX `ecms_variants_sku_idx` ON `ecms_variants` (`sku`);
--> statement-breakpoint
CREATE TABLE `ecms_variants__options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`value` integer
);

--> statement-breakpoint
CREATE INDEX `ecms_variants__options__parent_id_idx` ON `ecms_variants__options` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_variants__options_value_idx` ON `ecms_variants__options` (`value`);
--> statement-breakpoint
CREATE TABLE `ecms_carts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`customer` integer,
	`currency` text,
	`purchased_at` text,
	`secret` text
);

--> statement-breakpoint
CREATE INDEX `ecms_carts_created_at_idx` ON `ecms_carts` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_carts_customer_idx` ON `ecms_carts` (`customer`);
--> statement-breakpoint
CREATE INDEX `ecms_carts_purchased_at_idx` ON `ecms_carts` (`purchased_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_carts_secret_unique` ON `ecms_carts` (`secret`);
--> statement-breakpoint
CREATE TABLE `ecms_carts__items` (
	`id` text PRIMARY KEY NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`product` integer,
	`variant` integer,
	`quantity` real
);

--> statement-breakpoint
CREATE INDEX `ecms_carts__items__parent_id_idx` ON `ecms_carts__items` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_carts__items_product_idx` ON `ecms_carts__items` (`product`);
--> statement-breakpoint
CREATE INDEX `ecms_carts__items_variant_idx` ON `ecms_carts__items` (`variant`);
--> statement-breakpoint
CREATE TABLE `ecms_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`customer` integer,
	`name` text,
	`phone` text,
	`line1` text,
	`line2` text,
	`subdistrict` text,
	`district` text,
	`province` text,
	`postal_code` text,
	`country` text
);

--> statement-breakpoint
CREATE INDEX `ecms_addresses_created_at_idx` ON `ecms_addresses` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_addresses_customer_idx` ON `ecms_addresses` (`customer`);
--> statement-breakpoint
CREATE TABLE `ecms_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`order_number` text,
	`status` text,
	`customer` integer,
	`email` text,
	`currency` text,
	`subtotal` real,
	`total` real,
	`shipping_address_name` text,
	`shipping_address_phone` text,
	`shipping_address_line1` text,
	`shipping_address_line2` text,
	`shipping_address_subdistrict` text,
	`shipping_address_district` text,
	`shipping_address_province` text,
	`shipping_address_postal_code` text,
	`shipping_address_country` text,
	`payment` text,
	`payment_method` text,
	`locale` text,
	`stock_short` integer,
	`paid_at` text,
	`note` text
);

--> statement-breakpoint
CREATE INDEX `ecms_orders_created_at_idx` ON `ecms_orders` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_orders_order_number_unique` ON `ecms_orders` (`order_number`);
--> statement-breakpoint
CREATE INDEX `ecms_orders_status_idx` ON `ecms_orders` (`status`);
--> statement-breakpoint
CREATE INDEX `ecms_orders_customer_idx` ON `ecms_orders` (`customer`);
--> statement-breakpoint
CREATE TABLE `ecms_orders__items` (
	`id` text PRIMARY KEY NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`product` integer,
	`variant` integer,
	`title` text,
	`sku` text,
	`unit_price` real,
	`quantity` real,
	`total` real
);

--> statement-breakpoint
CREATE INDEX `ecms_orders__items__parent_id_idx` ON `ecms_orders__items` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_orders__items_product_idx` ON `ecms_orders__items` (`product`);
--> statement-breakpoint
CREATE INDEX `ecms_orders__items_variant_idx` ON `ecms_orders__items` (`variant`);
--> statement-breakpoint
CREATE TABLE `ecms_orders__adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`label` text,
	`amount` real
);

--> statement-breakpoint
CREATE INDEX `ecms_orders__adjustments__parent_id_idx` ON `ecms_orders__adjustments` (`_parent_id`);
--> statement-breakpoint
CREATE TABLE `ecms_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text,
	`method` text,
	`amount` real,
	`currency` text,
	`email` text,
	`customer` integer,
	`cart` integer,
	`order` integer,
	`checkout` text,
	`data` text,
	`reference` text,
	`error` text
);

--> statement-breakpoint
CREATE INDEX `ecms_transactions_created_at_idx` ON `ecms_transactions` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_transactions_status_idx` ON `ecms_transactions` (`status`);
--> statement-breakpoint
CREATE INDEX `ecms_transactions_customer_idx` ON `ecms_transactions` (`customer`);
--> statement-breakpoint
CREATE INDEX `ecms_transactions_cart_idx` ON `ecms_transactions` (`cart`);
--> statement-breakpoint
CREATE INDEX `ecms_transactions_order_idx` ON `ecms_transactions` (`order`);
--> statement-breakpoint
CREATE INDEX `ecms_transactions_reference_idx` ON `ecms_transactions` (`reference`);
--> statement-breakpoint
CREATE TABLE `ecms_shop_counters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`key` text,
	`value` real
);

--> statement-breakpoint
CREATE INDEX `ecms_shop_counters_created_at_idx` ON `ecms_shop_counters` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_shop_counters_key_unique` ON `ecms_shop_counters` (`key`);
--> statement-breakpoint
CREATE TABLE `ecms_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`token_hash` text,
	`user` integer,
	`expires_at` text
);

--> statement-breakpoint
CREATE INDEX `ecms_sessions_created_at_idx` ON `ecms_sessions` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_sessions_token_hash_unique` ON `ecms_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `ecms_sessions_user_idx` ON `ecms_sessions` (`user`);
--> statement-breakpoint
CREATE INDEX `ecms_sessions_expires_at_idx` ON `ecms_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `ecms_login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`key` text
);

--> statement-breakpoint
CREATE INDEX `ecms_login_attempts_created_at_idx` ON `ecms_login_attempts` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_login_attempts_key_idx` ON `ecms_login_attempts` (`key`);
--> statement-breakpoint
CREATE TABLE `ecms_email_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`message` text,
	`attempts` real,
	`next_attempt_at` text,
	`state` text,
	`error` text
);

--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_created_at_idx` ON `ecms_email_deliveries` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_next_attempt_at_idx` ON `ecms_email_deliveries` (`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `ecms_email_deliveries_state_idx` ON `ecms_email_deliveries` (`state`);
--> statement-breakpoint
CREATE TABLE `ecms_database_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`state` text,
	`trigger` text,
	`filename` text,
	`size` real,
	`started_at` text,
	`finished_at` text,
	`error` text,
	`author` text,
	`downloaded_by` text,
	`downloaded_at` text
);

--> statement-breakpoint
CREATE INDEX `ecms_database_backups_created_at_idx` ON `ecms_database_backups` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_database_backups_state_idx` ON `ecms_database_backups` (`state`);
--> statement-breakpoint
CREATE INDEX `ecms_database_backups_started_at_idx` ON `ecms_database_backups` (`started_at`);
--> statement-breakpoint
CREATE TABLE `ecms_globals` (
	`slug` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`status` text,
	`updated_at` text NOT NULL
);

