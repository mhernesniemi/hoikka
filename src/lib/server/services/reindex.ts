/**
 * Reindex logic for the product_search table.
 * Accepts a db instance as parameter so it can be used both from SvelteKit
 * services and from standalone scripts (e.g. scripts/reindex-products.ts).
 */
import { eq, and, sql, isNull } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import {
	products,
	productVariants,
	productFacetValues,
	facetValues,
	facets,
	assets,
	productSearch
} from "../db/schema.js";

interface FeaturedAssetJson {
	source: string;
	focalX: string;
	focalY: string;
}

type FacetsJson = Record<string, { code: string; name: string; facetValueId: number }[]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>;

/**
 * Reindex a single product into the search table.
 */
export async function reindexProduct(db: Db, productId: number): Promise<void> {
	// 1. Fetch product
	const [product] = await db
		.select()
		.from(products)
		.where(and(eq(products.id, productId), isNull(products.deletedAt)))
		.limit(1);

	if (!product) {
		await removeFromIndex(db, productId);
		return;
	}

	// 2. Fetch non-deleted variants -> compute minPrice, inStock
	const variants = await db
		.select({
			price: productVariants.price,
			stock: productVariants.stock,
			trackInventory: productVariants.trackInventory,
			imageUrl: productVariants.imageUrl,
			isFeatured: productVariants.isFeatured
		})
		.from(productVariants)
		.where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));

	let minPrice: number | null = null;
	let inStock = false;
	for (const v of variants) {
		if (minPrice === null || v.price < minPrice) {
			minPrice = v.price;
		}
		if (!v.trackInventory || v.stock > 0) {
			inStock = true;
		}
	}

	// 3. Fetch featured asset, falling back to variant image
	let featuredAsset: FeaturedAssetJson | null = null;
	if (product.featuredAssetId) {
		const [fa] = await db
			.select({
				source: assets.source,
				focalX: assets.focalX,
				focalY: assets.focalY
			})
			.from(assets)
			.where(eq(assets.id, product.featuredAssetId))
			.limit(1);
		if (fa) {
			featuredAsset = { source: fa.source, focalX: fa.focalX, focalY: fa.focalY };
		}
	}

	if (!featuredAsset) {
		const featuredVariant = variants.find((v) => v.isFeatured && v.imageUrl);
		const firstVariantWithImage = variants.find((v) => v.imageUrl);
		const fallbackUrl = featuredVariant?.imageUrl ?? firstVariantWithImage?.imageUrl;
		if (fallbackUrl) {
			featuredAsset = { source: fallbackUrl, focalX: "0.5", focalY: "0.5" };
		}
	}

	// 4. Fetch product facet values with facet info (single JOIN, exclude private)
	const facetRows = await db
		.select({
			facetCode: facets.code,
			facetValueCode: facetValues.code,
			facetValueName: facetValues.name,
			facetValueId: facetValues.id
		})
		.from(productFacetValues)
		.innerJoin(facetValues, eq(facetValues.id, productFacetValues.facetValueId))
		.innerJoin(facets, eq(facets.id, facetValues.facetId))
		.where(and(eq(productFacetValues.productId, productId), eq(facets.isPrivate, false)));

	const facetsJson: FacetsJson = {};
	for (const row of facetRows) {
		if (!facetsJson[row.facetCode]) {
			facetsJson[row.facetCode] = [];
		}
		facetsJson[row.facetCode].push({
			code: row.facetValueCode,
			name: row.facetValueName,
			facetValueId: row.facetValueId
		});
	}

	// 5. Upsert into productSearch
	await db
		.insert(productSearch)
		.values({
			productId: product.id,
			name: product.name,
			slug: product.slug,
			description: product.description,
			visibility: product.visibility,
			minPrice,
			inStock,
			featuredAsset: featuredAsset,
			facets: facetsJson,
			searchVector: sql`to_tsvector('simple', ${product.name} || ' ' || coalesce(${product.description}, ''))`,
			createdAt: product.createdAt,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: productSearch.productId,
			set: {
				name: product.name,
				slug: product.slug,
				description: product.description,
				visibility: product.visibility,
				minPrice,
				inStock,
				featuredAsset: featuredAsset,
				facets: facetsJson,
				searchVector: sql`to_tsvector('simple', ${product.name} || ' ' || coalesce(${product.description}, ''))`,
				updatedAt: new Date()
			}
		});
}

/**
 * Remove a product from the search index.
 */
export async function removeFromIndex(db: Db, productId: number): Promise<void> {
	await db.delete(productSearch).where(eq(productSearch.productId, productId));
}

/**
 * Reindex all non-deleted products. Clears table first.
 * Returns the number of products indexed.
 */
export async function reindexAll(db: Db): Promise<number> {
	await db.delete(productSearch);

	const allProducts = await db
		.select({ id: products.id })
		.from(products)
		.where(isNull(products.deletedAt));

	const batchSize = 50;
	for (let i = 0; i < allProducts.length; i += batchSize) {
		const batch = allProducts.slice(i, i + batchSize);
		await Promise.all(batch.map((p) => reindexProduct(db, p.id)));
	}

	return allProducts.length;
}
