-- Pin the deliverable for digital lines on orders placed before pinning
-- existed. 0013 backfilled how each line was sold (fulfillment_type) but not
-- which file it was sold with, so an admin "Retry fulfilment" on such an order
-- found no pin, granted nothing, and still reported success. The product's
-- current file is the best available evidence for those orders.
--
-- Only placed orders: a draft gets its pin at payment creation, from whatever
-- the product's file is *then*, and pinning it early would freeze it too soon.
UPDATE `order_lines`
SET `digital_asset_id` = (
  SELECT p.`digital_asset_id` FROM `product_variants` v
  JOIN `products` p ON p.`id` = v.`product_id`
  WHERE v.`id` = `order_lines`.`variant_id`
)
WHERE `fulfillment_type` = 'digital'
  AND `digital_asset_id` IS NULL
  AND `order_id` IN (
    SELECT `id` FROM `orders`
    WHERE `state` IN ('payment_pending', 'paid', 'shipped', 'delivered')
  );
