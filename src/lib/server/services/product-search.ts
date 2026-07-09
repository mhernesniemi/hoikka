/**
 * Product search using SQLite FTS5.
 * The FTS5 virtual table `product_search_fts` is populated by reindex.ts;
 * this file wraps read queries in a stable, pre-existing public API.
 */
import { sql, eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { productVariants, productVariantGroupPrices, customerGroupMembers } from "../db/schema.js";
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

interface FeaturedAssetJson {
	source: string;
	focalX: number;
	focalY: number;
}

type FacetsJson = Record<string, { code: string; name: string; facetValueId: number }[]>;

export function reindexProduct(productId: number): Promise<void> {
	return reindexProductCore(db, productId);
}

export function removeFromIndex(productId: number): Promise<void> {
	return removeFromIndexCore(db, productId);
}

export function reindexAll(): Promise<number> {
	return reindexAllCore(db);
}

// ----------------------------------------------------------------------------
// Query helpers
// ----------------------------------------------------------------------------

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
		if (valueCodes.length === 0) continue;
		const safeCode = facetCode.replace(/[^a-zA-Z0-9_-]/g, "");
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

function mapRow(row: FtsRow): ProductWithRelations {
	const featured = row.featured_asset
		? (JSON.parse(row.featured_asset) as FeaturedAssetJson)
		: null;
	const facetsJson = JSON.parse(row.facets || "{}") as FacetsJson;
	const inStock = row.in_stock === 1;

	const featuredAsset = featured
		? {
				id: 0,
				name: "",
				type: "image" as const,
				mimeType: "image/jpeg",
				width: 0,
				height: 0,
				fileSize: 0,
				source: featured.source,
				alt: null,
				focalX: featured.focalX,
				focalY: featured.focalY,
				createdAt: new Date()
			}
		: null;

	const variants: ProductVariantWithRelations[] =
		row.min_price !== null
			? [
					{
						id: 0,
						productId: row.productId,
						name: null,
						sku: "",
						price: row.min_price,
						stock: inStock ? 1 : 0,
						trackInventory: true,
						featuredAssetId: null,
						imageUrl: null,
						isFeatured: false,
						deletedAt: null,
						createdAt: new Date(),
						updatedAt: new Date(),
						facetValues: [],
						assets: [],
						featuredAsset: null
					}
				]
			: [];

	const facetValuesArray = Object.values(facetsJson).flat();

	return {
		id: row.productId,
		name: row.name,
		slug: "",
		description: row.description,
		type: "physical",
		visibility: row.visibility,
		taxCode: "standard",
		featuredAssetId: featuredAsset ? 0 : null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		variants,
		facetValues: facetValuesArray.map((fv) => ({
			id: fv.facetValueId,
			facetId: 0,
			name: fv.name,
			code: fv.code,
			createdAt: new Date(),
			updatedAt: new Date()
		})),
		assets: [],
		featuredAsset
	};
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export async function getAllProductCards(customerId: number | null): Promise<CachedProduct[]> {
	const rows = (await db.all(sql`
		SELECT
			rowid AS productId,
			name,
			'' AS slug,
			description,
			visibility,
			featured_asset,
			facets,
			variant_facet_images,
			min_price,
			max_price,
			in_stock
		FROM product_search_fts
		WHERE visibility = 'public'
		ORDER BY rowid DESC
	`)) as (FtsRow & { slug: string })[];

	const products: CachedProduct[] = rows.map((row) => ({
		id: row.productId,
		name: row.name,
		slug: row.slug,
		description: row.description,
		minPrice: row.min_price,
		maxPrice: row.max_price,
		inStock: row.in_stock === 1,
		featuredAsset: row.featured_asset ? JSON.parse(row.featured_asset) : null,
		facets: JSON.parse(row.facets || "{}"),
		variantFacetImages: JSON.parse(row.variant_facet_images || "null"),
		createdAt: new Date().toISOString()
	}));

	if (customerId) {
		const memberships = await db
			.select({ groupId: customerGroupMembers.groupId })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.customerId, customerId));

		if (memberships.length > 0) {
			const groupIds = memberships.map((m) => m.groupId);
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

			const lowest = new Map<number, number>();
			for (const r of groupPriceRows) {
				const cur = lowest.get(r.productId);
				if (cur === undefined || r.price < cur) lowest.set(r.productId, r.price);
			}
			for (const p of products) {
				const gp = lowest.get(p.id);
				if (gp !== undefined && (p.minPrice === null || gp < p.minPrice)) p.minPrice = gp;
			}
		}
	}

	return products;
}

export async function searchProducts(
	options: SearchOptions = {}
): Promise<PaginatedResult<ProductWithRelations>> {
	const { search, facets: facetFilters, visibility = "public", limit = 20, offset = 0 } = options;

	const conditions = [sql`visibility = ${visibility}`];

	const matchExpr = search ? buildMatchExpression(search) : null;
	if (matchExpr) conditions.push(sql`product_search_fts MATCH ${matchExpr}`);

	for (const c of facetConditions(facetFilters)) conditions.push(c);

	const where = sql.join(conditions, sql` AND `);
	const orderBy = matchExpr ? sql`rank` : sql`rowid DESC`;

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

	return {
		items: rows.map(mapRow),
		pagination: { total, limit, offset, hasMore: offset + rows.length < total }
	};
}

export async function getFilteredFacetCounts(
	options: Pick<SearchOptions, "search" | "facets" | "visibility"> = {}
): Promise<Record<string, FacetCountResult[]>> {
	const { search, facets: facetFilters, visibility = "public" } = options;

	const conditions = [sql`visibility = ${visibility}`];
	const matchExpr = search ? buildMatchExpression(search) : null;
	if (matchExpr) conditions.push(sql`product_search_fts MATCH ${matchExpr}`);
	for (const c of facetConditions(facetFilters)) conditions.push(c);

	const where = sql.join(conditions, sql` AND `);

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
		(counts[row.facetCode] ??= []).push({
			facetCode: row.facetCode,
			valueCode: row.valueCode,
			valueName: row.valueName,
			count: Number(row.count)
		});
	}
	return counts;
}
