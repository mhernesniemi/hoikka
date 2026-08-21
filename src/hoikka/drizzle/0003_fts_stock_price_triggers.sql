-- Keep the FTS index's stock/price aggregates in sync with variant changes.
-- The order path (stock decrement on payment, restore on cancel) previously
-- bypassed reindexing, so sold-out products kept showing as in stock in
-- search and listings. Structural changes (names, facets, images) still go
-- through reindexProduct in the app layer.
CREATE TRIGGER IF NOT EXISTS fts_variant_insert AFTER INSERT ON product_variants
BEGIN
	UPDATE product_search_fts SET
		in_stock = EXISTS(
			SELECT 1 FROM product_variants pv
			WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL
				AND (pv.track_inventory = 0 OR pv.stock > 0)
		),
		min_price = (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL),
		max_price = (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL)
	WHERE rowid = NEW.product_id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS fts_variant_update AFTER UPDATE OF stock, price, track_inventory, deleted_at ON product_variants
BEGIN
	UPDATE product_search_fts SET
		in_stock = EXISTS(
			SELECT 1 FROM product_variants pv
			WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL
				AND (pv.track_inventory = 0 OR pv.stock > 0)
		),
		min_price = (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL),
		max_price = (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = NEW.product_id AND pv.deleted_at IS NULL)
	WHERE rowid = NEW.product_id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS fts_variant_delete AFTER DELETE ON product_variants
BEGIN
	UPDATE product_search_fts SET
		in_stock = EXISTS(
			SELECT 1 FROM product_variants pv
			WHERE pv.product_id = OLD.product_id AND pv.deleted_at IS NULL
				AND (pv.track_inventory = 0 OR pv.stock > 0)
		),
		min_price = (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = OLD.product_id AND pv.deleted_at IS NULL),
		max_price = (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = OLD.product_id AND pv.deleted_at IS NULL)
	WHERE rowid = OLD.product_id;
END;
