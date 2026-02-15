/**
 * Product Service
 * Handles all product-related business logic and database operations
 */
import { eq, and, desc, asc, sql, inArray, isNull, like } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	products,
	productVariants,
	productFacetValues,
	variantFacetValues,
	facetValues,
	facets,
	productAssets,
	assets,
	productVariantGroupPrices,
	customerGroupMembers
} from "../db/schema.js";
import type {
	Product,
	ProductWithRelations,
	ProductVariant,
	ProductVariantWithRelations,
	ProductListOptions,
	CreateProductInput,
	UpdateProductInput,
	CreateVariantInput,
	UpdateVariantInput,
	FacetCount,
	FacetValue,
	PaginatedResult
} from "$lib/types.js";
import { DEFAULT_PRODUCT_TYPE } from "$lib/config/products.js";

export class ProductService {
	/**
	 * List products with filtering and pagination
	 */
	async list(options: ProductListOptions = {}): Promise<PaginatedResult<ProductWithRelations>> {
		const {
			facets: facetFilters,
			search,
			visibility = "public",
			limit = 20,
			offset = 0
		} = options;

		// Build base query conditions
		const conditions = [isNull(products.deletedAt)];

		if (visibility !== undefined) {
			if (Array.isArray(visibility)) {
				conditions.push(inArray(products.visibility, visibility));
			} else {
				conditions.push(eq(products.visibility, visibility));
			}
		}

		// Get product IDs that match facet filters
		let productIdsFromFacets: number[] | null = null;
		if (facetFilters && Object.keys(facetFilters).length > 0) {
			productIdsFromFacets = await this.getProductIdsByFacets(facetFilters);
			if (productIdsFromFacets.length === 0) {
				return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
			}
			conditions.push(inArray(products.id, productIdsFromFacets));
		}

		// Search filter
		if (search) {
			const searchProductIds = await this.searchProductIds(search);
			if (searchProductIds.length === 0) {
				return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
			}
			conditions.push(inArray(products.id, searchProductIds));
		}

		// Count total
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(products)
			.where(and(...conditions));
		const total = Number(countResult[0]?.count ?? 0);

		// Fetch products
		const productList = await db
			.select()
			.from(products)
			.where(and(...conditions))
			.orderBy(desc(products.createdAt))
			.limit(limit)
			.offset(offset);

		// Load relations for each product
		const items = await Promise.all(productList.map((p) => this.loadProductRelations(p)));

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
	 * Get a single product by ID
	 */
	async getById(id: number): Promise<ProductWithRelations | null> {
		const product = await db
			.select()
			.from(products)
			.where(and(eq(products.id, id), isNull(products.deletedAt)))
			.limit(1);

		if (!product[0]) return null;

		return this.loadProductRelations(product[0]);
	}

	/**
	 * Get a product by slug
	 */
	async getBySlug(slug: string): Promise<ProductWithRelations | null> {
		const product = await db
			.select()
			.from(products)
			.where(and(eq(products.slug, slug), isNull(products.deletedAt)))
			.limit(1);

		if (!product[0]) return null;

		return this.loadProductRelations(product[0]);
	}

	/**
	 * Create a new product
	 */
	async create(input: CreateProductInput): Promise<Product> {
		const [product] = await db
			.insert(products)
			.values({
				name: input.name,
				slug: input.slug,
				description: input.description,
				type: input.type ?? DEFAULT_PRODUCT_TYPE,
				visibility: input.visibility ?? "public",
				taxCode: input.taxCode ?? "standard"
			})
			.returning();

		return product;
	}

	/**
	 * Update an existing product
	 */
	async update(id: number, input: UpdateProductInput): Promise<ProductWithRelations | null> {
		const existing = await this.getById(id);
		if (!existing) return null;

		// Update product fields
		const updates: Record<string, unknown> = {};
		if (input.type !== undefined) updates.type = input.type;
		if (input.visibility !== undefined) updates.visibility = input.visibility;
		if (input.taxCode !== undefined) updates.taxCode = input.taxCode;
		if (input.name !== undefined) updates.name = input.name;
		if (input.slug !== undefined) updates.slug = input.slug;
		if (input.description !== undefined) updates.description = input.description;

		if (Object.keys(updates).length > 0) {
			await db.update(products).set(updates).where(eq(products.id, id));
		}

		return this.getById(id);
	}

	/**
	 * Soft delete a product
	 */
	async delete(id: number): Promise<boolean> {
		await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id));

		return true;
	}

	/**
	 * Add a facet value to a product
	 */
	async addFacetValue(productId: number, facetValueId: number): Promise<void> {
		await db
			.insert(productFacetValues)
			.values({ productId, facetValueId })
			.onConflictDoNothing();
	}

	/**
	 * Remove a facet value from a product
	 */
	async removeFacetValue(productId: number, facetValueId: number): Promise<void> {
		await db
			.delete(productFacetValues)
			.where(
				and(
					eq(productFacetValues.productId, productId),
					eq(productFacetValues.facetValueId, facetValueId)
				)
			);
	}

	/**
	 * Get facet counts for filtering UI
	 */
	async getFacetCounts(
		facetCode: string,
		currentFilters: Record<string, string[]> = {}
	): Promise<FacetCount[]> {
		// Get the facet
		const facet = await db.select().from(facets).where(eq(facets.code, facetCode)).limit(1);

		if (!facet[0]) return [];

		// Get all values for this facet with counts
		const values = await db
			.select({
				valueId: facetValues.id,
				valueCode: facetValues.code,
				valueName: facetValues.name,
				count: sql<number>`count(distinct ${productFacetValues.productId})`
			})
			.from(facetValues)
			.leftJoin(productFacetValues, eq(productFacetValues.facetValueId, facetValues.id))
			.leftJoin(products, eq(products.id, productFacetValues.productId))
			.where(and(eq(facetValues.facetId, facet[0].id), isNull(products.deletedAt)))
			.groupBy(facetValues.id, facetValues.code, facetValues.name);

		return values.map((v) => ({
			facetCode,
			valueCode: v.valueCode,
			valueName: v.valueName || v.valueCode,
			count: Number(v.count)
		}));
	}

	// ============================================================================
	// VARIANT METHODS
	// ============================================================================

	/**
	 * Create a product variant
	 */
	async createVariant(input: CreateVariantInput): Promise<ProductVariant> {
		const [variant] = await db
			.insert(productVariants)
			.values({
				productId: input.productId,
				name: input.name,
				sku: input.sku,
				price: input.price,
				stock: input.stock ?? 0,
				trackInventory: input.trackInventory ?? true,
				imageUrl: input.imageUrl
			})
			.returning();

		return variant;
	}

	/**
	 * Update a variant
	 */
	async updateVariant(id: number, input: UpdateVariantInput): Promise<ProductVariant | null> {
		const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, id));

		if (!variant) return null;

		const updateData: Record<string, unknown> = {};
		if (input.sku !== undefined) updateData.sku = input.sku;
		if (input.price !== undefined) updateData.price = input.price;
		if (input.stock !== undefined) updateData.stock = input.stock;
		if (input.trackInventory !== undefined) updateData.trackInventory = input.trackInventory;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;

		const [updated] = await db
			.update(productVariants)
			.set(updateData)
			.where(eq(productVariants.id, id))
			.returning();

		return updated;
	}

	/**
	 * Delete a variant
	 */
	async deleteVariant(id: number): Promise<boolean> {
		const now = new Date();
		await db
			.update(productVariants)
			.set({ deletedAt: now, sku: sql`sku || '_deleted_' || ${id}` })
			.where(eq(productVariants.id, id));

		return true;
	}

	/**
	 * Update variant stock
	 */
	async updateStock(variantId: number, quantity: number): Promise<void> {
		await db
			.update(productVariants)
			.set({
				stock: sql`${productVariants.stock} + ${quantity}`
			})
			.where(eq(productVariants.id, variantId));
	}

	/**
	 * Get variant by ID with relations
	 */
	async getVariantById(variantId: number): Promise<ProductVariantWithRelations | null> {
		const variant = await db
			.select()
			.from(productVariants)
			.where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
			.limit(1);

		if (!variant[0]) return null;

		return this.loadVariantRelations(variant[0]);
	}

	async addVariantFacetValue(variantId: number, facetValueId: number): Promise<void> {
		await db
			.insert(variantFacetValues)
			.values({ variantId, facetValueId })
			.onConflictDoNothing();
	}

	async removeVariantFacetValue(variantId: number, facetValueId: number): Promise<void> {
		await db
			.delete(variantFacetValues)
			.where(
				and(
					eq(variantFacetValues.variantId, variantId),
					eq(variantFacetValues.facetValueId, facetValueId)
				)
			);
	}

	// ============================================================================
	// GROUP PRICING METHODS
	// ============================================================================

	async getGroupPrices(variantId: number) {
		return db
			.select()
			.from(productVariantGroupPrices)
			.where(eq(productVariantGroupPrices.variantId, variantId));
	}

	async setGroupPrice(variantId: number, groupId: number, price: number) {
		const [result] = await db
			.insert(productVariantGroupPrices)
			.values({ variantId, groupId, price })
			.onConflictDoUpdate({
				target: [productVariantGroupPrices.variantId, productVariantGroupPrices.groupId],
				set: { price }
			})
			.returning();
		return result;
	}

	async removeGroupPrice(variantId: number, groupId: number) {
		await db
			.delete(productVariantGroupPrices)
			.where(
				and(
					eq(productVariantGroupPrices.variantId, variantId),
					eq(productVariantGroupPrices.groupId, groupId)
				)
			);
	}

	// ============================================================================
	// GROUP PRICE RESOLUTION
	// ============================================================================

	/**
	 * Resolve group prices for multiple variants in bulk.
	 * Returns a map of variantId → lowest group price (or null if no group price applies).
	 */
	async resolveGroupPrices(
		variantIds: number[],
		customerId: number | null
	): Promise<Map<number, number | null>> {
		const result = new Map<number, number | null>();
		if (!customerId || variantIds.length === 0) return result;

		// Get customer's group memberships
		const memberships = await db
			.select({ groupId: customerGroupMembers.groupId })
			.from(customerGroupMembers)
			.where(eq(customerGroupMembers.customerId, customerId));

		if (memberships.length === 0) return result;

		const groupIds = memberships.map((m) => m.groupId);

		// Get all matching group prices for the given variants
		const groupPrices = await db
			.select({
				variantId: productVariantGroupPrices.variantId,
				price: productVariantGroupPrices.price
			})
			.from(productVariantGroupPrices)
			.where(
				and(
					inArray(productVariantGroupPrices.variantId, variantIds),
					inArray(productVariantGroupPrices.groupId, groupIds)
				)
			);

		// Group by variant and pick the lowest price
		for (const gp of groupPrices) {
			const current = result.get(gp.variantId);
			if (current === undefined || current === null || gp.price < current) {
				result.set(gp.variantId, gp.price);
			}
		}

		return result;
	}

	// ============================================================================
	// PRIVATE HELPERS
	// ============================================================================

	private async loadProductRelations(product: Product): Promise<ProductWithRelations> {
		// Load variants
		const variantList = await db
			.select()
			.from(productVariants)
			.where(
				and(eq(productVariants.productId, product.id), isNull(productVariants.deletedAt))
			);

		const variants = await Promise.all(variantList.map((v) => this.loadVariantRelations(v)));

		// Load facet values
		const facetValueIds = await db
			.select({ facetValueId: productFacetValues.facetValueId })
			.from(productFacetValues)
			.where(eq(productFacetValues.productId, product.id));

		const facetValuesData = [];
		for (const fv of facetValueIds) {
			const value = await db
				.select()
				.from(facetValues)
				.where(eq(facetValues.id, fv.facetValueId))
				.limit(1);

			if (value[0]) {
				facetValuesData.push(value[0]);
			}
		}

		// Load assets
		const productAssetList = await db
			.select({ asset: assets, position: productAssets.position })
			.from(productAssets)
			.innerJoin(assets, eq(assets.id, productAssets.assetId))
			.where(eq(productAssets.productId, product.id))
			.orderBy(asc(productAssets.position));

		const assetList = productAssetList.map((pa) => pa.asset);

		// Load featured asset
		let featuredAsset = null;
		if (product.featuredAssetId) {
			const [fa] = await db
				.select()
				.from(assets)
				.where(eq(assets.id, product.featuredAssetId));
			featuredAsset = fa ?? null;
		}

		return {
			...product,
			variants,
			facetValues: facetValuesData,
			assets: assetList,
			featuredAsset
		};
	}

	private async loadVariantRelations(
		variant: ProductVariant
	): Promise<ProductVariantWithRelations> {
		// Load facet values
		const facetValueIds = await db
			.select({ facetValueId: variantFacetValues.facetValueId })
			.from(variantFacetValues)
			.where(eq(variantFacetValues.variantId, variant.id));

		const facetValuesData: FacetValue[] = [];
		for (const fv of facetValueIds) {
			const value = await db
				.select()
				.from(facetValues)
				.where(eq(facetValues.id, fv.facetValueId))
				.limit(1);

			if (value[0]) {
				facetValuesData.push(value[0]);
			}
		}

		return {
			...variant,
			facetValues: facetValuesData,
			assets: [],
			featuredAsset: null
		};
	}

	private async getProductIdsByFacets(facetFilters: Record<string, string[]>): Promise<number[]> {
		// Get all facet value IDs for the given filters
		const allValueIds: number[] = [];

		for (const [facetCode, valueCodes] of Object.entries(facetFilters)) {
			if (valueCodes.length === 0) continue;

			const facet = await db.select().from(facets).where(eq(facets.code, facetCode)).limit(1);

			if (!facet[0]) continue;

			const values = await db
				.select()
				.from(facetValues)
				.where(
					and(eq(facetValues.facetId, facet[0].id), inArray(facetValues.code, valueCodes))
				);

			allValueIds.push(...values.map((v) => v.id));
		}

		if (allValueIds.length === 0) return [];

		// Find products that have ALL the specified facet values
		const productMatches = await db
			.select({ productId: productFacetValues.productId })
			.from(productFacetValues)
			.where(inArray(productFacetValues.facetValueId, allValueIds))
			.groupBy(productFacetValues.productId);

		return productMatches.map((p) => p.productId);
	}

	private async searchProductIds(search: string): Promise<number[]> {
		const searchPattern = `%${search}%`;

		const matches = await db
			.select({ id: products.id })
			.from(products)
			.where(
				sql`(${products.name} ILIKE ${searchPattern} OR ${products.description} ILIKE ${searchPattern})`
			);

		return matches.map((m) => m.id);
	}

	/**
	 * Get lightweight product catalog for client-side search
	 * Returns only the fields needed for search: id, name, slug, price, image
	 */
	async getSearchCatalog() {
		const rows = await db
			.select({
				id: products.id,
				name: products.name,
				slug: products.slug,
				price: productVariants.price,
				image: assets.source
			})
			.from(products)
			.leftJoin(
				productVariants,
				and(eq(productVariants.productId, products.id), isNull(productVariants.deletedAt))
			)
			.leftJoin(assets, eq(assets.id, products.featuredAssetId))
			.where(and(eq(products.visibility, "public"), isNull(products.deletedAt)))
			.orderBy(asc(products.name));

		// Deduplicate by product id (multiple variants produce multiple rows), keep lowest price
		const seen = new Map<
			number,
			{ id: number; name: string; slug: string; price: number; image: string | null }
		>();
		for (const row of rows) {
			const existing = seen.get(row.id);
			if (!existing || (row.price !== null && row.price < existing.price)) {
				seen.set(row.id, {
					id: row.id,
					name: row.name,
					slug: row.slug,
					price: row.price ?? 0,
					image: row.image
				});
			}
		}

		return [...seen.values()];
	}
}

/**
 * Resolve and stamp effectivePrice onto each variant for a customer.
 * Combines group price resolution and application in one step.
 */
export async function stampGroupPrices(
	products: ProductWithRelations[],
	customerId: number | null
): Promise<void> {
	const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
	const groupPrices = await productService.resolveGroupPrices(variantIds, customerId);
	for (const product of products) {
		for (const variant of product.variants) {
			const gp = groupPrices.get(variant.id);
			variant.effectivePrice = gp ?? variant.price;
		}
	}
}

// Export singleton instance
export const productService = new ProductService();
