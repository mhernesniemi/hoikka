/**
 * Product Search Service
 * Manages the denormalized product_search table for fast storefront queries.
 */
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	productVariants,
	productVariantGroupPrices,
	productSearch,
	customerGroupMembers
} from "../db/schema.js";
import {
	reindexProduct as reindexProductCore,
	removeFromIndex as removeFromIndexCore,
	reindexAll as reindexAllCore
} from "./reindex.js";
import type {
	CachedProduct,
	ProductWithRelations,
	ProductVariantWithRelations,
	PaginatedResult
} from "$lib/types.js";

// ============================================================================
// TYPES
// ============================================================================

interface FeaturedAssetJson {
	source: string;
	focalX: string;
	focalY: string;
}

interface FacetValueJson {
	code: string;
	name: string;
	facetValueId: number;
}

type FacetsJson = Record<string, FacetValueJson[]>;

interface SearchOptions {
	search?: string;
	facets?: Record<string, string[]>;
	visibility?: "public" | "private" | "draft";
	limit?: number;
	offset?: number;
}

interface FacetCountResult {
	facetCode: string;
	valueCode: string;
	valueName: string;
	count: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a SQL condition that checks if a product has any of the given facet value codes
 * for a specific facet. Uses individual equality checks to avoid parameterized `->` key
 * and `ANY()` array issues with the neon driver.
 */
function buildFacetCondition(facetCode: string, valueCodes: string[]) {
	// Sanitize facet code to prevent SQL injection (only allow alphanumeric + underscore/hyphen)
	const safeFacetCode = facetCode.replace(/[^a-zA-Z0-9_-]/g, "");
	const codeChecks = valueCodes.map((code) => sql`elem->>'code' = ${code}`);
	// Use sql.raw for the JSONB key literal to avoid -> operator overload ambiguity with parameters
	const facetKey = sql.raw(`'${safeFacetCode}'`);
	return sql`EXISTS (
		SELECT 1 FROM jsonb_array_elements(${productSearch.facets}->${facetKey}) AS elem
		WHERE (${sql.join(codeChecks, sql` OR `)})
	)`;
}

// ============================================================================
// REINDEX FUNCTIONS (delegates to shared reindex.ts)
// ============================================================================

export function reindexProduct(productId: number): Promise<void> {
	return reindexProductCore(db, productId);
}

export function removeFromIndex(productId: number): Promise<void> {
	return removeFromIndexCore(db, productId);
}

export function reindexAll(): Promise<number> {
	return reindexAllCore(db);
}

// ============================================================================
// CACHED PRODUCT CARDS
// ============================================================================

/**
 * Fetch all public products from product_search as lightweight CachedProduct[].
 * Resolves B2B group prices for the given customer if applicable.
 */
export async function getAllProductCards(customerId: number | null): Promise<CachedProduct[]> {
	const rows = await db
		.select()
		.from(productSearch)
		.where(eq(productSearch.visibility, "public"));

	const products: CachedProduct[] = rows.map((row) => ({
		id: row.productId,
		name: row.name,
		slug: row.slug,
		description: row.description,
		minPrice: row.minPrice,
		inStock: row.inStock,
		featuredAsset: row.featuredAsset as CachedProduct["featuredAsset"],
		facets: (row.facets ?? {}) as CachedProduct["facets"]
	}));

	// Resolve group prices if customer is logged in
	if (customerId) {
		const memberships = await db
			.select({ groupId: customerGroupMembers.groupId })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.customerId, customerId));

		if (memberships.length > 0) {
			const groupIds = memberships.map((m) => m.groupId);

			// Get all group prices for this customer's groups, joined with variant to get productId
			const groupPriceRows = await db
				.select({
					productId: productVariants.productId,
					price: productVariantGroupPrices.price
				})
				.from(productVariantGroupPrices)
				.innerJoin(
					productVariants,
					eq(productVariants.id, productVariantGroupPrices.variantId)
				)
				.where(
					and(
						inArray(productVariantGroupPrices.groupId, groupIds),
						isNull(productVariants.deletedAt)
					)
				);

			// Build map: productId → lowest group price
			const lowestGroupPrice = new Map<number, number>();
			for (const row of groupPriceRows) {
				const current = lowestGroupPrice.get(row.productId);
				if (current === undefined || row.price < current) {
					lowestGroupPrice.set(row.productId, row.price);
				}
			}

			// Stamp the effective minPrice
			for (const product of products) {
				const gp = lowestGroupPrice.get(product.id);
				if (gp !== undefined && (product.minPrice === null || gp < product.minPrice)) {
					product.minPrice = gp;
				}
			}
		}
	}

	return products;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Search products using the denormalized search table.
 * Returns paginated results.
 */
export async function searchProducts(
	options: SearchOptions = {}
): Promise<PaginatedResult<ProductWithRelations>> {
	const { search, facets: facetFilters, visibility = "public", limit = 20, offset = 0 } = options;

	const conditions: ReturnType<typeof eq>[] = [];

	// Visibility filter
	conditions.push(eq(productSearch.visibility, visibility));

	// Full-text search
	let searchCondition: ReturnType<typeof sql> | null = null;
	if (search && search.trim()) {
		const terms = search
			.trim()
			.split(/\s+/)
			.map((t) => t.replace(/[^a-zA-Z0-9äöåÄÖÅ]/g, ""))
			.filter(Boolean);
		if (terms.length > 0) {
			const tsquery = terms.map((t) => `${t}:*`).join(" & ");
			searchCondition = sql`${productSearch.searchVector} @@ to_tsquery('simple', ${tsquery})`;
		}
	}

	// Facet filters
	const facetConditions: ReturnType<typeof sql>[] = [];
	if (facetFilters && Object.keys(facetFilters).length > 0) {
		for (const [facetCode, valueCodes] of Object.entries(facetFilters)) {
			if (valueCodes.length === 0) continue;
			facetConditions.push(buildFacetCondition(facetCode, valueCodes));
		}
	}

	// Build WHERE clause
	const allConditions = [
		...conditions.map((c) => sql`${c}`),
		...(searchCondition ? [searchCondition] : []),
		...facetConditions
	];

	const whereClause = allConditions.length > 0 ? sql.join(allConditions, sql` AND `) : sql`TRUE`;

	// Count total
	const countResult = await db.execute(
		sql`SELECT count(*) as count FROM ${productSearch} WHERE ${whereClause}`
	);
	const total = Number((countResult.rows[0] as { count: string })?.count ?? 0);

	// Fetch results
	const rows = await db.execute(
		sql`SELECT * FROM ${productSearch} WHERE ${whereClause} ORDER BY ${productSearch.updatedAt} DESC LIMIT ${limit} OFFSET ${offset}`
	);

	const items = (rows.rows as unknown as SearchRow[]).map(toProductCard);

	return {
		items,
		pagination: {
			total,
			limit,
			offset,
			hasMore: offset + items.length < total
		}
	};
}

/**
 * Get facet value counts respecting current filters.
 * Single query using jsonb_each + jsonb_array_elements.
 */
export async function getFilteredFacetCounts(
	options: Pick<SearchOptions, "search" | "facets" | "visibility"> = {}
): Promise<Record<string, FacetCountResult[]>> {
	const { search, facets: facetFilters, visibility = "public" } = options;

	const conditions: ReturnType<typeof sql>[] = [sql`${productSearch.visibility} = ${visibility}`];

	// Full-text search
	if (search && search.trim()) {
		const terms = search
			.trim()
			.split(/\s+/)
			.map((t) => t.replace(/[^a-zA-Z0-9äöåÄÖÅ]/g, ""))
			.filter(Boolean);
		if (terms.length > 0) {
			const tsquery = terms.map((t) => `${t}:*`).join(" & ");
			conditions.push(sql`${productSearch.searchVector} @@ to_tsquery('simple', ${tsquery})`);
		}
	}

	// Facet filters (AND between facets)
	if (facetFilters && Object.keys(facetFilters).length > 0) {
		for (const [facetCode, valueCodes] of Object.entries(facetFilters)) {
			if (valueCodes.length === 0) continue;
			conditions.push(buildFacetCondition(facetCode, valueCodes));
		}
	}

	const whereClause = sql.join(conditions, sql` AND `);

	// Extract all facet values with counts in a single query
	const result = await db.execute(sql`
		SELECT
			facet_key as "facetCode",
			elem->>'code' as "valueCode",
			elem->>'name' as "valueName",
			count(*) as count
		FROM ${productSearch},
			jsonb_each(${productSearch.facets}) AS kv(facet_key, facet_arr),
			jsonb_array_elements(facet_arr) AS elem
		WHERE ${whereClause}
		GROUP BY facet_key, elem->>'code', elem->>'name'
		ORDER BY facet_key, count DESC
	`);

	const counts: Record<string, FacetCountResult[]> = {};
	for (const row of result.rows as {
		facetCode: string;
		valueCode: string;
		valueName: string;
		count: string;
	}[]) {
		if (!counts[row.facetCode]) {
			counts[row.facetCode] = [];
		}
		counts[row.facetCode].push({
			facetCode: row.facetCode,
			valueCode: row.valueCode,
			valueName: row.valueName,
			count: Number(row.count)
		});
	}

	return counts;
}

// ============================================================================
// TYPE MAPPING
// ============================================================================

interface SearchRow {
	product_id: number;
	name: string;
	slug: string;
	description: string | null;
	visibility: "public" | "private" | "draft";
	min_price: number | null;
	in_stock: boolean;
	featured_asset: FeaturedAssetJson | null;
	facets: FacetsJson;
	created_at: string;
	updated_at: string;
}

/**
 * Map a search table row to ProductWithRelations shape
 * so existing ProductCard.svelte works without changes.
 */
function toProductCard(row: SearchRow): ProductWithRelations {
	const featuredAsset = row.featured_asset
		? {
				id: 0,
				name: "",
				type: "image" as const,
				mimeType: "image/jpeg",
				width: 0,
				height: 0,
				fileSize: 0,
				source: row.featured_asset.source,
				alt: null,
				focalX: row.featured_asset.focalX,
				focalY: row.featured_asset.focalY,
				createdAt: new Date(row.created_at)
			}
		: null;

	// Build minimal variant for price display
	const variants: ProductVariantWithRelations[] =
		row.min_price !== null
			? [
					{
						id: 0,
						productId: row.product_id,
						name: null,
						sku: "",
						price: row.min_price,
						stock: row.in_stock ? 1 : 0,
						trackInventory: true,
						featuredAssetId: null,
						imageUrl: null,
						isFeatured: false,
						deletedAt: null,
						createdAt: new Date(row.created_at),
						updatedAt: new Date(row.updated_at),
						facetValues: [],
						assets: [],
						featuredAsset: null
					}
				]
			: [];

	// Collect all facet values from JSON
	const facetValuesArray = Object.values(row.facets ?? {}).flat();

	return {
		id: row.product_id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		type: "physical",
		visibility: row.visibility,
		taxCode: "standard",
		featuredAssetId: featuredAsset ? 0 : null,
		deletedAt: null,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		variants,
		facetValues: facetValuesArray.map((fv) => ({
			id: fv.facetValueId,
			facetId: 0,
			name: fv.name,
			code: fv.code,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at)
		})),
		assets: [],
		featuredAsset
	};
}
