CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`full_name` text,
	`company` text,
	`street_line_1` text NOT NULL,
	`street_line_2` text,
	`city` text NOT NULL,
	`postal_code` text NOT NULL,
	`country` text NOT NULL,
	`phone_number` text,
	`is_default` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `addresses_customer_idx` ON `addresses` (`customer_id`);--> statement-breakpoint
CREATE TABLE `asset_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`alt` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_translations_asset_lang_idx` ON `asset_translations` (`asset_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer DEFAULT 0,
	`height` integer DEFAULT 0,
	`file_size` integer DEFAULT 0,
	`source` text NOT NULL,
	`alt` text,
	`focal_x` real DEFAULT 0.5 NOT NULL,
	`focal_y` real DEFAULT 0.5 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`parent_id` integer,
	`slug` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`featured_asset_id` integer,
	`tax_code` text DEFAULT 'standard' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`featured_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `category_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_translations_category_lang_idx` ON `category_translations` (`category_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `collection_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`field` text NOT NULL,
	`operator` text NOT NULL,
	`value` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_filters_collection_idx` ON `collection_filters` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collection_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_translations_collection_lang_idx` ON `collection_translations` (`collection_id`,`language_code`);--> statement-breakpoint
CREATE INDEX `collection_translations_slug_idx` ON `collection_translations` (`slug`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`description` text,
	`is_private` integer DEFAULT false NOT NULL,
	`featured_asset_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`featured_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_page_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_page_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text,
	FOREIGN KEY (`content_page_id`) REFERENCES `content_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_page_translations_page_lang_idx` ON `content_page_translations` (`content_page_id`,`language_code`);--> statement-breakpoint
CREATE INDEX `content_page_translations_slug_idx` ON `content_page_translations` (`slug`);--> statement-breakpoint
CREATE TABLE `content_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`body` text,
	`image_url` text,
	`published` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_group_members` (
	`customer_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`customer_id`, `group_id`),
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `customer_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_group_members_customer_idx` ON `customer_group_members` (`customer_id`);--> statement-breakpoint
CREATE INDEX `customer_group_members_group_idx` ON `customer_group_members` (`group_id`);--> statement-breakpoint
CREATE TABLE `customer_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_tax_exempt` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_groups_code_unique` ON `customer_groups` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_groups_code_idx` ON `customer_groups` (`code`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`auth_user_id` text,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text,
	`vat_id` text,
	`deleted_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_auth_user_id_unique` ON `customers` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_auth_user_id_idx` ON `customers` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`first_name`,`last_name`);--> statement-breakpoint
CREATE TABLE `facet_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facet_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`facet_id`) REFERENCES `facets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facet_translations_facet_lang_idx` ON `facet_translations` (`facet_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `facet_value_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facet_value_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`facet_value_id`) REFERENCES `facet_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facet_value_translations_value_lang_idx` ON `facet_value_translations` (`facet_value_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `facet_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facet_id` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`code` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`facet_id`) REFERENCES `facets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facet_values_facet_code_idx` ON `facet_values` (`facet_id`,`code`);--> statement-breakpoint
CREATE INDEX `facet_values_facet_idx` ON `facet_values` (`facet_id`);--> statement-breakpoint
CREATE TABLE `facets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`code` text NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facets_code_unique` ON `facets` (`code`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	`tax_code` text DEFAULT 'standard' NOT NULL,
	`tax_rate` integer DEFAULT 2400 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`unit_price_net` integer DEFAULT 0 NOT NULL,
	`line_total_net` integer DEFAULT 0 NOT NULL,
	`product_name` text NOT NULL,
	`variant_name` text,
	`sku` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_lines_order_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_lines_variant_idx` ON `order_lines` (`variant_id`);--> statement-breakpoint
CREATE TABLE `order_promotions` (
	`order_id` integer NOT NULL,
	`promotion_id` integer NOT NULL,
	`discount_amount` integer NOT NULL,
	`type` text DEFAULT 'order' NOT NULL,
	PRIMARY KEY(`order_id`, `promotion_id`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_promotions_order_idx` ON `order_promotions` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_shipping` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`shipping_method_id` integer NOT NULL,
	`tracking_number` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`price` integer NOT NULL,
	`metadata` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_methods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_shipping_order_idx` ON `order_shipping` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_shipping_method_idx` ON `order_shipping` (`shipping_method_id`);--> statement-breakpoint
CREATE INDEX `order_shipping_status_idx` ON `order_shipping` (`status`);--> statement-breakpoint
CREATE INDEX `order_shipping_tracking_idx` ON `order_shipping` (`tracking_number`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`customer_id` integer,
	`checkout_token` text,
	`active` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'created' NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`shipping` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`total_net` integer DEFAULT 0 NOT NULL,
	`is_tax_exempt` integer DEFAULT false NOT NULL,
	`currency_code` text DEFAULT 'EUR' NOT NULL,
	`exchange_rate` integer DEFAULT 1000000 NOT NULL,
	`shipping_full_name` text,
	`shipping_street_line_1` text,
	`shipping_street_line_2` text,
	`shipping_city` text,
	`shipping_postal_code` text,
	`shipping_country` text,
	`customer_email` text,
	`order_placed_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_token_unique` ON `orders` (`checkout_token`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_state_idx` ON `orders` (`state`);--> statement-breakpoint
CREATE INDEX `orders_placed_at_idx` ON `orders` (`order_placed_at`);--> statement-breakpoint
CREATE INDEX `orders_active_idx` ON `orders` (`active`);--> statement-breakpoint
CREATE INDEX `orders_checkout_token_idx` ON `orders` (`checkout_token`);--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_methods_code_unique` ON `payment_methods` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_methods_code_idx` ON `payment_methods` (`code`);--> statement-breakpoint
CREATE INDEX `payment_methods_active_idx` ON `payment_methods` (`active`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`payment_method_id` integer NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text,
	`error_message` text,
	`metadata` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `payments_method_idx` ON `payments` (`payment_method_id`);--> statement-breakpoint
CREATE INDEX `payments_state_idx` ON `payments` (`state`);--> statement-breakpoint
CREATE INDEX `payments_transaction_idx` ON `payments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `product_assets` (
	`product_id` integer NOT NULL,
	`asset_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`product_id`, `asset_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_assets_product_idx` ON `product_assets` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_categories_product_idx` ON `product_categories` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_categories_category_idx` ON `product_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `product_facet_values` (
	`product_id` integer NOT NULL,
	`facet_value_id` integer NOT NULL,
	PRIMARY KEY(`product_id`, `facet_value_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facet_value_id`) REFERENCES `facet_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_facet_values_product_idx` ON `product_facet_values` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_facet_values_value_idx` ON `product_facet_values` (`facet_value_id`);--> statement-breakpoint
CREATE TABLE `product_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_translations_product_lang_idx` ON `product_translations` (`product_id`,`language_code`);--> statement-breakpoint
CREATE INDEX `product_translations_slug_idx` ON `product_translations` (`slug`);--> statement-breakpoint
CREATE TABLE `product_variant_assets` (
	`variant_id` integer NOT NULL,
	`asset_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`variant_id`, `asset_id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_variant_assets_variant_idx` ON `product_variant_assets` (`variant_id`);--> statement-breakpoint
CREATE TABLE `product_variant_group_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`price` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variant_group_price_unique` ON `product_variant_group_prices` (`variant_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `variant_group_prices_variant_idx` ON `product_variant_group_prices` (`variant_id`);--> statement-breakpoint
CREATE INDEX `variant_group_prices_group_idx` ON `product_variant_group_prices` (`group_id`);--> statement-breakpoint
CREATE TABLE `product_variant_translations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`language_code` text NOT NULL,
	`name` text,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variant_translations_variant_lang_idx` ON `product_variant_translations` (`variant_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`name` text,
	`sku` text NOT NULL,
	`price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`track_inventory` integer DEFAULT true NOT NULL,
	`featured_asset_id` integer,
	`image_url` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_idx` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`description` text,
	`type` text DEFAULT 'physical' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`tax_code` text DEFAULT 'standard' NOT NULL,
	`featured_asset_id` integer,
	`deleted_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_visibility_idx` ON `products` (`visibility`);--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`createdAt`);--> statement-breakpoint
CREATE TABLE `promotion_collections` (
	`promotion_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	PRIMARY KEY(`promotion_id`, `collection_id`),
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `promotion_products` (
	`promotion_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	PRIMARY KEY(`promotion_id`, `product_id`),
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`method` text DEFAULT 'code' NOT NULL,
	`code` text,
	`title` text,
	`promotion_type` text DEFAULT 'order' NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`applies_to` text DEFAULT 'all' NOT NULL,
	`min_order_amount` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`usage_limit_per_customer` integer,
	`combines_with_other_promotions` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`customer_group_id` integer,
	`starts_at` integer,
	`ends_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`customer_group_id`) REFERENCES `customer_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_code_unique` ON `promotions` (`code`);--> statement-breakpoint
CREATE INDEX `promotions_code_idx` ON `promotions` (`code`);--> statement-breakpoint
CREATE INDEX `promotions_enabled_idx` ON `promotions` (`enabled`);--> statement-breakpoint
CREATE TABLE `related_products` (
	`product_id` integer NOT NULL,
	`related_product_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`product_id`, `related_product_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `related_products_product_idx` ON `related_products` (`product_id`);--> statement-breakpoint
CREATE INDEX `related_products_related_idx` ON `related_products` (`related_product_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`nickname` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`is_verified_purchase` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_product_idx` ON `reviews` (`product_id`);--> statement-breakpoint
CREATE INDEX `reviews_customer_idx` ON `reviews` (`customer_id`);--> statement-breakpoint
CREATE INDEX `reviews_status_idx` ON `reviews` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_product_customer_idx` ON `reviews` (`product_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `shipping_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_methods_code_unique` ON `shipping_methods` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_methods_code_idx` ON `shipping_methods` (`code`);--> statement-breakpoint
CREATE INDEX `shipping_methods_active_idx` ON `shipping_methods` (`active`);--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`order_line_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stock_reservations_variant_idx` ON `stock_reservations` (`variant_id`);--> statement-breakpoint
CREATE INDEX `stock_reservations_expires_idx` ON `stock_reservations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `stock_reservations_order_idx` ON `stock_reservations` (`order_id`);--> statement-breakpoint
CREATE INDEX `stock_reservations_line_idx` ON `stock_reservations` (`order_line_id`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`code` text PRIMARY KEY NOT NULL,
	`rate` integer NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `variant_facet_values` (
	`variant_id` integer NOT NULL,
	`facet_value_id` integer NOT NULL,
	PRIMARY KEY(`variant_id`, `facet_value_id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facet_value_id`) REFERENCES `facet_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variant_facet_values_variant_idx` ON `variant_facet_values` (`variant_id`);--> statement-breakpoint
CREATE INDEX `variant_facet_values_value_idx` ON `variant_facet_values` (`facet_value_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
