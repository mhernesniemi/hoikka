-- An asset that was sold on an order line cannot be deleted.
--
-- order_lines.digital_asset_id pins the file a customer bought, and that pin
-- has to survive even before its download grant exists. A foreign key would
-- express this, but adding one to an existing SQLite column forces a table
-- rebuild — and dropping order_lines cascades into stock_reservations and
-- digital_downloads. On D1 that cascade cannot be suppressed (foreign keys
-- cannot be disabled inside a migration), so the rebuild would silently delete
-- live reservations and paid download grants. A trigger gives the same
-- guarantee without touching the table.
CREATE TRIGGER IF NOT EXISTS assets_not_deletable_while_sold
BEFORE DELETE ON assets
FOR EACH ROW WHEN EXISTS (
  SELECT 1 FROM `order_lines` WHERE `digital_asset_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'asset was sold on an order line and cannot be deleted');
END;--> statement-breakpoint
-- Backfill the sold fulfilment type for existing lines from the product they
-- were bought from. Today's type is the best available evidence for orders
-- placed before the column existed.
UPDATE `order_lines`
SET `fulfillment_type` = COALESCE((
  SELECT p.`type` FROM `product_variants` v
  JOIN `products` p ON p.`id` = v.`product_id`
  WHERE v.`id` = `order_lines`.`variant_id`
), 'physical')
WHERE `fulfillment_type` IS NULL;
