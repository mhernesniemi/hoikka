-- Listing data the in-memory facet index reads. Product rows and the FTS table
-- itself are covered by reindexProduct, which bumps the version too.
INSERT OR IGNORE INTO `search_index_version` (`id`, `version`) VALUES (1, 0);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_product_variants_insert AFTER INSERT ON product_variants
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_product_variants_update AFTER UPDATE OF price, stock, track_inventory, deleted_at, product_id ON product_variants
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_product_variants_delete AFTER DELETE ON product_variants
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_product_facet_values_insert AFTER INSERT ON product_facet_values
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_product_facet_values_delete AFTER DELETE ON product_facet_values
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_facet_values_update AFTER UPDATE OF code, name ON facet_values
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS search_index_facet_values_delete AFTER DELETE ON facet_values
BEGIN
	UPDATE search_index_version SET version = version + 1 WHERE id = 1;
END;
