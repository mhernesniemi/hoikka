-- Make the per-customer promotion limit idempotent for the same order.
--
-- SQLite runs BEFORE INSERT triggers ahead of conflict resolution, so the
-- previous version raised on a re-insert of a row that already existed — the
-- exact shape a retried completion produces — instead of letting
-- ON CONFLICT DO NOTHING absorb it. A retry at the customer's limit would then
-- fail the whole transaction, which in the payment path meant voiding an
-- authorisation that was actually fine.
--
-- The row this order already owns is excluded from the check, so re-inserting
-- it is always a no-op and only a *different* order can hit the limit.
DROP TRIGGER IF EXISTS promotion_usages_within_customer_limit;--> statement-breakpoint
CREATE TRIGGER promotion_usages_within_customer_limit
BEFORE INSERT ON promotion_usages
FOR EACH ROW WHEN (
  SELECT `usage_limit_per_customer` FROM `promotions` WHERE `id` = NEW.`promotion_id`
) IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `promotion_usages`
  WHERE `promotion_id` = NEW.`promotion_id`
    AND `customer_id` = NEW.`customer_id`
    AND `order_id` = NEW.`order_id`
) AND (
  SELECT COUNT(*) FROM `promotion_usages`
  WHERE `promotion_id` = NEW.`promotion_id` AND `customer_id` = NEW.`customer_id`
) >= (
  SELECT `usage_limit_per_customer` FROM `promotions` WHERE `id` = NEW.`promotion_id`
)
BEGIN
  SELECT RAISE(ABORT, 'promotion already used by this customer');
END;
