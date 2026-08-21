/**
 * Reindex logic for the SQLite FTS5 product search table.
 */
import { eq, and, sql, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
	products,
	productVariants,
	productFacetValues,
	variantFacetValues,
	facetValues,
	facets,
	assets
} from "../db/schema.js";

interface FeaturedAssetJson {
	source: string;
	focalX: number;
	focalY: number;
}

type FacetsJson = Record<string, { code: string; name: string; facetValueId: number }[]>;
type VariantFacetImagesJson = Record<string, Record<string, string>>;

export async function reindexProduct(db: Db, productId: number): Promise<void> {
	const [product] = await db
		.select()
		.from(products)
		.where(and(eq(products.id, productId), isNull(products.deletedAt)))
		.limit(1);

	if (!product) {
		await removeFromIndex(db, productId);
		return;
	}

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
	let maxPrice: number | null = null;
	let inStock = false;
	for (const v of variants) {
		if (minPrice === null || v.price < minPrice) minPrice = v.price;
		if (maxPrice === null || v.price > maxPrice) maxPrice = v.price;
		if (!v.trackInventory || v.stock > 0) inStock = true;
	}

	let featuredAsset: FeaturedAssetJson | null = null;
	if (product.featuredAssetId) {
		const [fa] = await db
			.select({ source: assets.source, focalX: assets.focalX, focalY: assets.focalY })
			.from(assets)
			.where(eq(assets.id, product.featuredAssetId))
			.limit(1);
		if (fa) featuredAsset = fa;
	}
	if (!featuredAsset) {
		const variantWithImage =
			variants.find((v) => v.isFeatured && v.imageUrl) ?? variants.find((v) => v.imageUrl);
		if (variantWithImage?.imageUrl) {
			featuredAsset = { source: variantWithImage.imageUrl, focalX: 0.5, focalY: 0.5 };
		}
	}

	const productFacetRows = await db
		.select({
			facetCode: facets.code,
			valueCode: facetValues.code,
			valueName: facetValues.name,
			facetValueId: facetValues.id
		})
		.from(productFacetValues)
		.innerJoin(facetValues, eq(productFacetValues.facetValueId, facetValues.id))
		.innerJoin(facets, eq(facetValues.facetId, facets.id))
		.where(eq(productFacetValues.productId, productId));

	const facetsJson: FacetsJson = {};
	for (const row of productFacetRows) {
		(facetsJson[row.facetCode] ??= []).push({
			code: row.valueCode,
			name: row.valueName,
			facetValueId: row.facetValueId
		});
	}

	const variantRows = await db
		.select({
			imageUrl: productVariants.imageUrl,
			facetCode: facets.code,
			valueCode: facetValues.code
		})
		.from(productVariants)
		.innerJoin(variantFacetValues, eq(variantFacetValues.variantId, productVariants.id))
		.innerJoin(facetValues, eq(variantFacetValues.facetValueId, facetValues.id))
		.innerJoin(facets, eq(facetValues.facetId, facets.id))
		.where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));

	const variantFacetImages: VariantFacetImagesJson = {};
	for (const row of variantRows) {
		if (!row.imageUrl) continue;
		(variantFacetImages[row.facetCode] ??= {})[row.valueCode] = row.imageUrl;
	}

	await db.run(sql`DELETE FROM product_search_fts WHERE rowid = ${productId}`);
	await db.run(sql`
		INSERT INTO product_search_fts (
			rowid, name, description, visibility,
			featured_asset, facets, variant_facet_images,
			min_price, max_price, in_stock
		) VALUES (
			${productId},
			${product.name},
			${product.description ?? ""},
			${product.visibility},
			${featuredAsset ? JSON.stringify(featuredAsset) : null},
			${JSON.stringify(facetsJson)},
			${JSON.stringify(variantFacetImages)},
			${minPrice},
			${maxPrice},
			${inStock ? 1 : 0}
		)
	`);
}

export async function removeFromIndex(db: Db, productId: number): Promise<void> {
	await db.run(sql`DELETE FROM product_search_fts WHERE rowid = ${productId}`);
}

export async function reindexAll(db: Db): Promise<number> {
	await db.run(sql`DELETE FROM product_search_fts`);
	const all = await db
		.select({ id: products.id })
		.from(products)
		.where(isNull(products.deletedAt));
	for (const p of all) await reindexProduct(db, p.id);
	return all.length;
}
