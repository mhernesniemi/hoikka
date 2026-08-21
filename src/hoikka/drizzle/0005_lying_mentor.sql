CREATE TABLE `digital_downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`order_line_id` integer NOT NULL,
	`asset_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`max_downloads` integer DEFAULT 10 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_token_unique` ON `digital_downloads` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_token_idx` ON `digital_downloads` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_line_idx` ON `digital_downloads` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `digital_downloads_order_idx` ON `digital_downloads` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfillment_error` text;--> statement-breakpoint
ALTER TABLE `products` ADD `digital_asset_id` integer;