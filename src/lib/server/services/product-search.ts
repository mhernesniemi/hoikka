/**
 * Product listing and search over the SQLite FTS5 index.
 *
 * `listProducts` is the one entry point for storefront listing pages
 * (products, category, collection): free-text search, facet filters with
 * disjunctive counts, price range, sort, and pagination — all computed
 * server-side so the catalog never ships to the client. The FTS5 table is
 * populated by reindex.ts and kept stock/price-fresh by SQL triggers; the
 * filtering and counting run on an in-memory facet index built from it.
 */
import { sql, eq, and as sqlAnd, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { productVariants, productVariantGroupPrices, customerGroupMembers } from "../db/schema.js";
import {
	reindexProduct as reindexProductCore,
	removeFromIndex as removeFromIndexCore,
	reindexAll as reindexAllCore
} from "./reindex.js";
import type { CachedProduct, PaginatedResult, ProductSortKey } from "#lib/types.js";
import { and, facetIndex, has, popcount } from "./facet-index.js";

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
	/** Joined from products — the FTS table itself doesn't store it */
	slug: string | null;
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

const SORT_KEYS: ProductSortKey[] = ["newest", "price-asc", "price-desc", "name-asc", "name-desc"];

function mapRow(row: FtsRow): CachedProduct {
	return {
		id: row.productId,
		name: row.name,
		slug: row.slug ?? "",
		description: row.description,
		minPrice: row.min_price,
		maxPrice: row.max_price,
		inStock: row.in_stock >= 1,
		featuredAsset: row.featured_asset ? JSON.parse(row.featured_asset) : null,
		facets: JSON.parse(row.facets || "{}"),
		variantFacetImages: JSON.parse(row.variant_facet_images || "null")
	};
}

/**
 * Page-item prices for customers with group pricing: a variant's group price
 * replaces its list price, as in the cart; the product shows its lowest variant.
 */
async function applyGroupPricing(items: CachedProduct[], customerId: number | null | undefined) {
	if (!customerId || items.length === 0) return;

	const memberships = await db
		.select({ groupId: customerGroupMembers.groupId })
		.from(customerGroupMembers)
		.where(eq(customerGroupMembers.customerId, customerId));
	if (memberships.length === 0) return;

	const rows = await db
		.select({
			productId: productVariants.productId,
			variantId: productVariants.id,
			listPrice: productVariants.price,
			groupPrice: sql<number | null>`MIN(${productVariantGroupPrices.price})`
		})
		.from(productVariants)
		.leftJoin(
			productVariantGroupPrices,
			sqlAnd(
				eq(productVariantGroupPrices.variantId, productVariants.id),
				inArray(
					productVariantGroupPrices.groupId,
					memberships.map((m) => m.groupId)
				)
			)
		)
		.where(
			sqlAnd(
				inArray(
					productVariants.productId,
					items.map((p) => p.id)
				),
				isNull(productVariants.deletedAt)
			)
		)
		.groupBy(productVariants.id);

	const lowest = new Map<number, number>();
	for (const r of rows) {
		const price = r.groupPrice ?? r.listPrice;
		const cur = lowest.get(r.productId);
		if (cur === undefined || price < cur) lowest.set(r.productId, price);
	}
	for (const p of items) p.minPrice = lowest.get(p.id) ?? p.minPrice;
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
		sort: sort && SORT_KEYS.includes(sort) ? sort : "newest",
		page: Math.max(1, Number(url.searchParams.get("page")) || 1),
		priceMin: priceMin && Number(priceMin) > 0 ? Math.round(Number(priceMin) * 100) : undefined,
		priceMax: priceMax && Number(priceMax) > 0 ? Math.round(Number(priceMax) * 100) : undefined
	};
}

/** Text search: the matching products, in relevance order. */
async function searchMatches(search: string): Promise<number[] | null> {
	const matchExpr = buildMatchExpression(search);
	if (!matchExpr) return null;
	const rows = (await db.all(sql`
		SELECT rowid AS id FROM product_search_fts
		WHERE visibility = 'public' AND product_search_fts MATCH ${matchExpr}
		ORDER BY ${RELEVANCE_SQL}
	`)) as { id: number }[];
	return rows.map((r) => r.id);
}

/**
 * Filtering, counting and paging run on the in-memory facet index
 * (facet-index.ts); SQL only does the text match and reads the page's rows.
 */
export async function listProducts(options: ListingOptions = {}): Promise<ListingResult> {
	const { sort = "newest", page = 1, limit = 40 } = options;
	const offset = (page - 1) * limit;
	const index = await facetIndex();

	// Scope: what the facet values and price range are offered from
	const scope = index.all();
	const matches = options.search ? await searchMatches(options.search) : null;
	if (matches) and(scope, index.fromIds(matches));
	if (options.productIds) and(scope, index.fromIds(options.productIds));

	const priced =
		options.priceMin != null || options.priceMax != null
			? index.priced(options.priceMin, options.priceMax)
			: null;
	const active = Object.entries(options.facets ?? {}).filter(([, v]) => v.length > 0);
	const groupBits = new Map(active.map(([code, values]) => [code, index.anyOf(code, values)]));
	const filtered = ({ skip, withPrice = true }: { skip?: string; withPrice?: boolean } = {}) => {
		const bits = scope.slice();
		if (priced && withPrice) and(bits, priced);
		for (const [code, b] of groupBits) if (code !== skip) and(bits, b);
		return bits;
	};
	const result = filtered();

	const baseFacetCounts = index.counts(scope);
	// Disjunctive counts: each facet group with an active filter is counted
	// with its own filter removed, so users can see the alternatives
	const facetCounts =
		active.length === 0 && !priced ? { ...baseFacetCounts } : index.counts(result);
	for (const [code] of active)
		facetCounts[code] = index.counts(filtered({ skip: code }))[code] ?? [];

	// Relevance while searching, unless a sort was chosen
	const order =
		matches && sort === "newest"
			? matches.flatMap((id) => index.positionOf(id) ?? [])
			: sort === "newest"
				? newestFirst(index.size)
				: await index.order(sort);

	const total = popcount(result);
	const pageIds: number[] = [];
	let skipped = 0;
	for (const p of order) {
		if (pageIds.length >= limit) break;
		if (!has(result, p)) continue;
		if (skipped++ < offset) continue;
		pageIds.push(index.ids[p]);
	}

	const rows = pageIds.length
		? ((await db.all(sql`
			SELECT
				rowid AS productId,
				name, description, visibility,
				featured_asset, facets, variant_facet_images,
				min_price, max_price, in_stock,
				(SELECT slug FROM products WHERE id = product_search_fts.rowid) AS slug
			FROM product_search_fts
			WHERE rowid IN (${sql.join(
				pageIds.map((id) => sql`${id}`),
				sql`, `
			)})
		`)) as FtsRow[])
		: [];
	const byId = new Map(rows.map((r) => [r.productId, r]));
	const items = pageIds.flatMap((id) => (byId.has(id) ? [mapRow(byId.get(id)!)] : []));
	await applyGroupPricing(items, options.customerId);

	return {
		items,
		pagination: { total, limit, offset, hasMore: offset + items.length < total },
		facetCounts,
		baseFacetCounts,
		// For the price filter's bounds: the results without the price filter itself
		priceRange: index.priceRange(filtered({ withPrice: false }))
	};
}

function newestFirst(size: number): number[] {
	return Array.from({ length: size }, (_, i) => size - 1 - i);
}

/** Lightweight top-N name search for the header search dropdown. */
export async function quickSearchProducts(
	term: string,
	limit = 8
): Promise<
	{ id: number; name: string; slug: string; price: number | null; image: string | null }[]
> {
	const matchExpr = buildMatchExpression(term);
	if (!matchExpr) return [];

	const rows = (await db.all(sql`
		SELECT rowid AS productId, name, min_price, featured_asset,
			(SELECT slug FROM products WHERE id = product_search_fts.rowid) AS slug
		FROM product_search_fts
		WHERE visibility = 'public' AND product_search_fts MATCH ${matchExpr}
		ORDER BY ${RELEVANCE_SQL}
		LIMIT ${limit}
	`)) as Pick<FtsRow, "productId" | "name" | "slug" | "min_price" | "featured_asset">[];

	return rows.map((row) => ({
		id: row.productId,
		name: row.name,
		slug: row.slug ?? "",
		price: row.min_price,
		image: row.featured_asset
			? (JSON.parse(row.featured_asset) as { source: string }).source
			: null
	}));
}
