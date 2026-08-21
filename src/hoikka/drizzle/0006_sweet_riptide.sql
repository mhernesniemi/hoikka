CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_window_idx` ON `rate_limits` (`window_start`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_digital_downloads` (
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
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_digital_downloads`("id", "order_id", "order_line_id", "asset_id", "token", "expires_at", "download_count", "max_downloads", "createdAt") SELECT "id", "order_id", "order_line_id", "asset_id", "token", "expires_at", "download_count", "max_downloads", "createdAt" FROM `digital_downloads`;--> statement-breakpoint
DROP TABLE `digital_downloads`;--> statement-breakpoint
ALTER TABLE `__new_digital_downloads` RENAME TO `digital_downloads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_token_unique` ON `digital_downloads` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_token_idx` ON `digital_downloads` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `digital_downloads_line_idx` ON `digital_downloads` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `digital_downloads_order_idx` ON `digital_downloads` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfilled_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_draft_sweep_idx` ON `orders` (`state`,`active`,`updatedAt`);--> statement-breakpoint
--> the unique index below cannot be created while an order already has more
--> than one chargeable payment, which older code allowed. Keep the newest and
--> void the rest. "cancelled", not "declined": a declined payment may still
--> be retried on the same intent, so labelling a superseded one that way would
--> let an old intent settle and fulfil the order behind the new one's back.
UPDATE `payments` SET `state` = 'cancelled'
WHERE `state` in ('pending', 'authorized')
  AND `id` NOT IN (
    SELECT MAX(`id`) FROM `payments`
    WHERE `state` in ('pending', 'authorized')
    GROUP BY `order_id`
  );--> statement-breakpoint
CREATE UNIQUE INDEX `payments_one_active_per_order_idx` ON `payments` (`order_id`) WHERE "payments"."state" in ('pending', 'authorized');