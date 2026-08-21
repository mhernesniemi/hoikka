-- Inventory may never go negative.
--
-- Stock is validated before a payment is settled, but validation and the
-- decrement are separate steps: two *different* orders can each check the last
-- unit, pass, and then both decrement it. Guarding the UPDATE would silently
-- skip the decrement instead — an order paid with stock intact, which is worse
-- than a refusal. A BEFORE UPDATE trigger aborts the statement, which aborts
-- the surrounding transaction (better-sqlite3) or batch (D1) on both targets,
-- so the losing order does not become paid at all.
--
-- A trigger rather than a CHECK constraint on purpose: adding a CHECK to
-- product_variants would require SQLite to rebuild the table, which drops the
-- FTS triggers created in 0003 and would silently stop search indexing.
CREATE TRIGGER IF NOT EXISTS product_variants_stock_non_negative
BEFORE UPDATE OF stock ON product_variants
FOR EACH ROW WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'stock cannot go negative');
END;--> statement-breakpoint
-- Payments superseded by the 0006 cleanup were marked 'declined', but a
-- declined payment is explicitly allowed to settle later (a shopper retrying a
-- refused card on the same intent). Anything that is not an order's most recent
-- payment and is already dead is re-labelled 'cancelled': never honour it, and
-- flag it for a refund if the gateway captures it anyway.
UPDATE `payments` SET `state` = 'cancelled'
WHERE `state` = 'declined'
  AND EXISTS (
    SELECT 1 FROM `payments` AS newer
    WHERE newer.`order_id` = `payments`.`order_id` AND newer.`id` > `payments`.`id`
  );
--> statement-breakpoint
-- A promotion's usage limit is a real capacity, not advice.
--
-- The count is incremented inside the transaction that makes an order paid, so
-- two orders holding the last permitted use would otherwise both increment and
-- both pay the discounted total. Aborting here rolls that transaction back, so
-- only one of them becomes paid.
CREATE TRIGGER IF NOT EXISTS promotions_usage_within_limit
BEFORE UPDATE OF usage_count ON promotions
FOR EACH ROW WHEN NEW.usage_limit IS NOT NULL AND NEW.usage_count > NEW.usage_limit
BEGIN
  SELECT RAISE(ABORT, 'promotion usage limit reached');
END;
