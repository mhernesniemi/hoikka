CREATE TABLE `promotion_usages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`promotion_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_usages_unique_idx` ON `promotion_usages` (`promotion_id`,`customer_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `promotion_usages_customer_idx` ON `promotion_usages` (`promotion_id`,`customer_id`);--> statement-breakpoint
-- Backfill from the orders that already used a promotion, so existing
-- per-customer limits keep counting from where they are rather than resetting.
INSERT OR IGNORE INTO `promotion_usages` (`promotion_id`, `customer_id`, `order_id`, `createdAt`)
SELECT op.`promotion_id`, o.`customer_id`, o.`id`, (strftime('%s','now') * 1000)
FROM `order_promotions` op
JOIN `orders` o ON o.`id` = op.`order_id`
WHERE o.`customer_id` IS NOT NULL AND o.`state` IN ('paid', 'shipped', 'delivered');--> statement-breakpoint
-- A per-customer usage limit is a capacity, like the global one. The row is
-- written inside the transaction that makes an order paid, so two checkouts for
-- the same account cannot both slip past a separate count query: the second
-- insert aborts and rolls its whole transaction back.
CREATE TRIGGER IF NOT EXISTS promotion_usages_within_customer_limit
BEFORE INSERT ON promotion_usages
FOR EACH ROW WHEN (
  SELECT `usage_limit_per_customer` FROM `promotions` WHERE `id` = NEW.`promotion_id`
) IS NOT NULL AND (
  SELECT COUNT(*) FROM `promotion_usages`
  WHERE `promotion_id` = NEW.`promotion_id` AND `customer_id` = NEW.`customer_id`
) >= (
  SELECT `usage_limit_per_customer` FROM `promotions` WHERE `id` = NEW.`promotion_id`
)
BEGIN
  SELECT RAISE(ABORT, 'promotion already used by this customer');
END;
