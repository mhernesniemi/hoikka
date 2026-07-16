/**
 * Product listing and search over the SQLite FTS5 index.
 *
 * `listProducts` is the one entry point for storefront listing pages
 * (products, category, collection): free-text search, facet filters with
 * disjunctive counts, price range, sort, and pagination — all computed
 * server-side so the catalog never ships to the client. The FTS5 table is
 * populated by reindex.ts and kept stock/price-fresh by SQL triggers.
 */
import { sql, eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { productVariants, productVariantGroupPrices, customerGroupMembers } from "../db/schema.js";
import {
	reindexProduct as reindexProductCore,
	removeFromIndex as removeFromIndexCore,
	reindexAll as reindexAllCore
} from "./reindex.js";
import type { CachedProduct, PaginatedResult, ProductSortKey } from "$lib/types.js";

// reindex.ts takes an explicit db so the standalone seed script can pass its
// own connection; these wrappers bind the app db for route/service callers.
export const reindexProduct = (productId: number) => reindexProductCore(db, productId);
export const removeFromIndex = (productId: number) => removeFromIndexCore(db, productId);
export const reindexAll = () => reindexAllCore(db);

export interface ListingOptions {
	search?: string;
	facets?: Record<string, string[]>;
	/** Scope to a category's or collection's products */
	productIds?: number[];
	/** Price bounds in cents, applied to a product's lowest price */
	priceMin?: number;
	priceMax?: number;
	sort?: ProductSortKey;
	page?: number;
	limit?: number;
	/** Applies customer-group pricing to returned prices */
	customerId?: number | null;
}

export interface FacetCountResult {
	facetCode: string;
	valueCode: string;
	valueName: string;
	count: number;
}

export interface ListingResult {
	items: CachedProduct[];
	pagination: PaginatedResult<CachedProduct>["pagination"];
	/** Counts under the current filters (disjunctive within each facet group) */
	facetCounts: Record<string, FacetCountResult[]>;
	/** Counts for the page scope ignoring facet/price filters — decides which values to show */
	baseFacetCounts: Record<string, FacetCountResult[]>;
	priceRange: { min: number; max: number } | null;
}

interface FtsRow {
	productId: number;
	name: string;
	description: string | null;
	visibility: "public" | "private" | "draft";
	featured_asset: string | null;
	facets: string;
	variant_facet_images: string;
	min_price: number | null;
	max_price: number | null;
	in_stock: number;
}

/**
 * Relevance ranking: bm25 with per-column weights (declaration order: name,
 * description, then UNINDEXED columns which never match). A name hit weighs
 * 10x a description hit, so title matches surface first. Ascending, like `rank`.
 */
const RELEVANCE_SQL = sql.raw("bm25(product_search_fts, 10.0, 1.0)");

/**
 * Build an FTS5 MATCH expression from free-text. Strips punctuation, treats each
 * term as a prefix (`term*`), joins with implicit AND (space).
 */
function buildMatchExpression(search: string): string | null {
	const terms = search
		.trim()
		.split(/\s+/)
		.map((t) => t.replace(/["*()]/g, ""))
		.filter((t) => t.length > 0);
	if (terms.length === 0) return null;
	return terms.map((t) => `"${t}"*`).join(" ");
}

/**
 * Build a facet-filter SQL fragment. Each facet is AND'd; values within a
 * facet are OR'd. Uses json_each over the UNINDEXED facets JSON column.
 */
function facetConditions(facetFilters: Record<string, string[]> | undefined) {
	if (!facetFilters) return [];
	const conds = [];
	for (const [facetCode, valueCodes] of Object.entries(facetFilters)) {
		const safeCode = facetCode.replace(/[^a-zA-Z0-9_-]/g, "");
		// Skip empty codes — json_extract($.<empty>) is an invalid JSON path
		if (!safeCode || valueCodes.length === 0) continue;
		conds.push(sql`EXISTS (
			SELECT 1 FROM json_each(json_extract(product_search_fts.facets, ${"$." + safeCode}))
			WHERE json_extract(value, '$.code') IN (${sql.join(
				valueCodes.map((c) => sql`${c}`),
				sql`, `
			)})
		)`);
	}
	return conds;
}

function buildConditions(opts: {
	search?: string;
	facets?: Record<string, string[]>;
	productIds?: number[];
	priceMin?: number;
	priceMax?: number;
}) {
	const conditions = [sql`visibility = 'public'`];

	const matchExpr = opts.search ? buildMatchExpression(opts.search) : null;
	if (matchExpr) conditions.push(sql`product_search_fts MATCH ${matchExpr}`);

	// Qualified rowid: the facet-count query joins json_each() tables,
	// where a bare `rowid` is ambiguous
	if (opts.productIds) {
		conditions.push(
			opts.productIds.length > 0
				? sql`product_search_fts.rowid IN (${sql.join(
						opts.productIds.map((id) => sql`${id}`),
						sql`, `
					)})`
				: sql`0`
		);
	}

	if (opts.priceMin != null) conditions.push(sql`min_price >= ${opts.priceMin}`);
	if (opts.priceMax != null) conditions.push(sql`min_price <= ${opts.priceMax}`);

	for (const c of facetConditions(opts.facets)) conditions.push(c);

	return { where: sql.join(conditions, sql` AND `), matched: matchExpr !== null };
}

const SORT_SQL: Record<ProductSortKey, ReturnType<typeof sql.raw>> = {
	newest: sql.raw("rowid DESC"),
	"price-asc": sql.raw("min_price IS NULL, min_price ASC"),
	"price-desc": sql.raw("min_price IS NULL, min_price DESC"),
	"name-asc": sql.raw("name COLLATE NOCASE ASC"),
	"name-desc": sql.raw("name COLLATE NOCASE DESC")
};

function mapRow(row: FtsRow): CachedProduct {
	return {
		id: row.productId,
		name: row.name,
		slug: "",
		description: row.description,
		minPrice: row.min_price,
		maxPrice: row.max_price,
		inStock: row.in_stock >= 1,
		featuredAsset: row.featured_asset ? JSON.parse(row.featured_asset) : null,
		facets: JSON.parse(row.facets || "{}"),
		variantFacetImages: JSON.parse(row.variant_facet_images || "null")
	};
}

async function facetCountsFor(where: ReturnType<typeof sql.join>) {
	const rows = (await db.all(sql`
		SELECT
			facet_kv.key AS facetCode,
			json_extract(elem.value, '$.code') AS valueCode,
			json_extract(elem.value, '$.name') AS valueName,
			count(DISTINCT product_search_fts.rowid) AS count
		FROM product_search_fts,
			json_each(product_search_fts.facets) AS facet_kv,
			json_each(facet_kv.value) AS elem
		WHERE ${where}
		GROUP BY facetCode, valueCode, valueName
		ORDER BY facetCode, count DESC
	`)) as { facetCode: string; valueCode: string; valueName: string; count: number }[];

	const counts: Record<string, FacetCountResult[]> = {};
	for (const row of rows) {
		(counts[row.facetCode] ??= []).push({ ...row, count: Number(row.count) });
	}
	return counts;
}

/** Lower page-item prices for customers with group pricing. */
async function applyGroupPricing(items: CachedProduct[], customerId: number | null | undefined) {
	if (!customerId || items.length === 0) return;

	const memberships = await db
		.select({ groupId: customerGroupMembers.groupId })
		.from(customerGroupMembers)
		.where(eq(customerGroupMembers.customerId, customerId));
	if (memberships.length === 0) return;

	const groupPriceRows = await db
		.select({
			productId: productVariants.productId,
			price: productVariantGroupPrices.price
		})
		.from(productVariantGroupPrices)
		.innerJoin(productVariants, eq(productVariants.id, productVariantGroupPrices.variantId))
		.where(
			and(
				inArray(
					productVariantGroupPrices.groupId,
					memberships.map((m) => m.groupId)
				),
				inArray(
					productVariants.productId,
					items.map((p) => p.id)
				),
				isNull(productVariants.deletedAt)
			)
		);

	const lowest = new Map<number, number>();
	for (const r of groupPriceRows) {
		const cur = lowest.get(r.productId);
		if (cur === undefined || r.price < cur) lowest.set(r.productId, r.price);
	}
	for (const p of items) {
		const gp = lowest.get(p.id);
		if (gp !== undefined && (p.minPrice === null || gp < p.minPrice)) p.minPrice = gp;
	}
}

/** Parse listing state (q / sort / page / facet_* / price_*) from a listing page URL. */
export function parseListingParams(
	url: URL
): Pick<ListingOptions, "search" | "facets" | "sort" | "page" | "priceMin" | "priceMax"> {
	const facets: Record<string, string[]> = {};
	for (const [key, value] of url.searchParams) {
		if (!key.startsWith("facet_") || !value) continue;
		const code = key.slice("facet_".length);
		if (code) (facets[code] ??= []).push(value);
	}
	const priceMin = url.searchParams.get("price_min");
	const priceMax = url.searchParams.get("price_max");
	const sort = url.searchParams.get("sort") as ProductSortKey | null;

	return {
		search: url.searchParams.get("q") ?? undefined,
		facets: Object.keys(facets).length > 0 ? facets : undefined,
		// Object.hasOwn — a plain `in` would accept prototype keys like ?sort=toString
		sort: sort && Object.hasOwn(SORT_SQL, sort) ? sort : "newest",
		page: Math.max(1, Number(url.searchParams.get("page")) || 1),
		priceMin: priceMin && Number(priceMin) > 0 ? Math.round(Number(priceMin) * 100) : undefined,
		priceMax: priceMax && Number(priceMax) > 0 ? Math.round(Number(priceMax) * 100) : undefined
	};
}

export async function listProducts(options: ListingOptions = {}): Promise<ListingResult> {
	const { sort = "newest", page = 1, limit = 40 } = options;
	const offset = (page - 1) * limit;

	const { where, matched } = buildConditions(options);
	// Relevance order while searching (unless the user chose an explicit sort).
	// Fall back to newest for any unrecognized sort key (defensive — parseListingParams already guards).
	const orderBy =
		matched && sort === "newest" ? RELEVANCE_SQL : (SORT_SQL[sort] ?? SORT_SQL.newest);

	const countRow = (await db.get(
		sql`SELECT count(*) AS count FROM product_search_fts WHERE ${where}`
	)) as { count: number } | undefined;
	const total = Number(countRow?.count ?? 0);

	const rows = (await db.all(sql`
		SELECT
			rowid AS productId,
			name, description, visibility,
			featured_asset, facets, variant_facet_images,
			min_price, max_price, in_stock
		FROM product_search_fts
		WHERE ${where}
		ORDER BY ${orderBy}
		LIMIT ${limit} OFFSET ${offset}
	`)) as FtsRow[];
	const items = rows.map(mapRow);
	await applyGroupPricing(items, options.customerId);

	// Base counts (scope + search only) decide which facet values are relevant
	const scopeOnly = buildConditions({
		search: options.search,
		productIds: options.productIds
	}).where;
	const baseFacetCounts = await facetCountsFor(scopeOnly);

	// Disjunctive counts: each facet group with an active filter is counted
	// with its own filter removed, so users can see the alternatives.
	const activeGroups = Object.entries(options.facets ?? {}).filter(([, v]) => v.length > 0);
	const facetCounts =
		activeGroups.length === 0 ? { ...baseFacetCounts } : await facetCountsFor(where);
	for (const [groupCode] of activeGroups) {
		const withoutGroup = Object.fromEntries(
			activeGroups.filter(([code]) => code !== groupCode)
		);
		const groupWhere = buildConditions({ ...options, facets: withoutGroup }).where;
		const counts = await facetCountsFor(groupWhere);
		facetCounts[groupCode] = counts[groupCode] ?? [];
	}

	// Price range for the scope, ignoring the price filter itself
	const rangeRow = (await db.get(sql`
		SELECT MIN(min_price) AS min, MAX(min_price) AS max
		FROM product_search_fts
		WHERE ${buildConditions({ ...options, priceMin: undefined, priceMax: undefined }).where}
			AND min_price IS NOT NULL
	`)) as { min: number | null; max: number | null } | undefined;

	return {
		items,
		pagination: { total, limit, offset, hasMore: offset + items.length < total },
		facetCounts,
		baseFacetCounts,
		priceRange:
			rangeRow?.min != null && rangeRow.max != null
				? { min: rangeRow.min, max: rangeRow.max }
				: null
	};
}

/** Lightweight top-N name search for the header search dropdown. */
export async function quickSearchProducts(
	term: string,
	limit = 8
): Promise<{ id: number; name: string; price: number | null; image: string | null }[]> {
	const matchExpr = buildMatchExpression(term);
	if (!matchExpr) return [];

	const rows = (await db.all(sql`
		SELECT rowid AS productId, name, min_price, featured_asset
		FROM product_search_fts
		WHERE visibility = 'public' AND product_search_fts MATCH ${matchExpr}
		ORDER BY ${RELEVANCE_SQL}
		LIMIT ${limit}
	`)) as Pick<FtsRow, "productId" | "name" | "min_price" | "featured_asset">[];

	return rows.map((row) => ({
		id: row.productId,
		name: row.name,
		price: row.min_price,
		image: row.featured_asset
			? (JSON.parse(row.featured_asset) as { source: string }).source
			: null
	}));
}
