-- FTS5 virtual table for product search.
-- Rowid = product id. UNINDEXED columns carry filter/display data.
-- unicode61 with diacritic removal so Finnish "äöå" matches their ASCII forms.
CREATE VIRTUAL TABLE IF NOT EXISTS product_search_fts USING fts5(
	name,
	description,
	visibility UNINDEXED,
	featured_asset UNINDEXED,
	facets UNINDEXED,
	variant_facet_images UNINDEXED,
	min_price UNINDEXED,
	max_price UNINDEXED,
	in_stock UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);
