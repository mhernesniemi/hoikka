/**
 * Product Service
 * Handles all product-related business logic and database operations
 */
import { eq, and, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
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
	ProductListItem,
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
} from "@hoikka/core/shared/types";
import { DEFAULT_PRODUCT_TYPE } from "@hoikka/core/config/derived";

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
		if (facetFilters && Object.keys(facetFilters).length > 0) {
			const productIdsFromFacets = await this.getProductIdsByFacets(facetFilters);
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

		// Load relations for all products in batched queries
		const items = await this.loadProductsRelations(productList);

		return {
			items,
			pagination: paginationOf(total, limit, offset, items.length)
		};
	}

	/**
	 * List products with lightweight summary data for admin list views.
	 * Uses 2 queries (count + data) instead of N*M.
	 */
	async listSummary(
		options: ProductListOptions & { sortBy?: string; sortOrder?: "asc" | "desc" } = {}
	): Promise<PaginatedResult<ProductListItem>> {
		const {
			search,
			visibility = "public",
			limit = 20,
			offset = 0,
			sortBy,
			sortOrder = "desc"
		} = options;

		const conditions = [isNull(products.deletedAt)];

		if (visibility !== undefined) {
			if (Array.isArray(visibility)) {
				conditions.push(inArray(products.visibility, visibility));
			} else {
				conditions.push(eq(products.visibility, visibility));
			}
		}

		if (search) {
			const searchProductIds = await this.searchProductIds(search);
			if (searchProductIds.length === 0) {
				return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
			}
			conditions.push(inArray(products.id, searchProductIds));
		}

		// Count query
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(products)
			.where(and(...conditions));
		const total = Number(countResult[0]?.count ?? 0);

		// Resolve sort column
		const variantCountExpr = sql<number>`(SELECT count(*) FROM product_variants WHERE product_id = ${products.id} AND deleted_at IS NULL)`;
		const orderByExpr = resolveSort(
			{
				name: sql`${products.name}`,
				variants: variantCountExpr,
				visibility: sql`${products.visibility}`,
				createdAt: sql`${products.createdAt}`
			},
			sortBy,
			sortOrder,
			sql`${products.createdAt}`
		);

		// Fallback: if product has no featuredAssetId, use the first variant's imageUrl
		const variantImageFallback = sql<string>`(
			SELECT image_url FROM product_variants
			WHERE product_id = ${products.id} AND deleted_at IS NULL AND image_url IS NOT NULL
			ORDER BY is_featured DESC, id ASC
			LIMIT 1
		)`;

		// Data query with variant count subquery and featured asset join
		const items = await db
			.select({
				id: products.id,
				name: products.name,
				visibility: products.visibility,
				createdAt: products.createdAt,
				variantCount: variantCountExpr,
				featuredAssetSource: sql<string>`COALESCE(${assets.source}, ${variantImageFallback})`
			})
			.from(products)
			.leftJoin(assets, eq(products.featuredAssetId, assets.id))
			.where(and(...conditions))
			.orderBy(orderByExpr)
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((item) => ({
				...item,
				variantCount: Number(item.variantCount),
				featuredAssetSource: item.featuredAssetSource ?? null
			})),
			pagination: paginationOf(total, limit, offset, items.length)
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
	 * Get several products by id in the given order, with relations loaded
	 * in batched queries (missing/deleted ids are skipped)
	 */
	async getByIds(ids: number[]): Promise<ProductWithRelations[]> {
		if (ids.length === 0) return [];

		const rows = await db
			.select()
			.from(products)
			.where(and(inArray(products.id, ids), isNull(products.deletedAt)));

		const byId = new Map(rows.map((p) => [p.id, p]));
		const ordered = ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);

		return this.loadProductsRelations(ordered);
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
		if (input.customFields !== undefined) {
			// Merge over what is stored: an admin form only submits the fields
			// its product type declares, and untouched keys must survive.
			updates.customFields = { ...existing.customFields, ...input.customFields };
		}

		if (Object.keys(updates).length > 0) {
			await db.update(products).set(updates).where(eq(products.id, id));
		}

		return this.getById(id);
	}

	/**
	 * Set (or clear) the file a digital product delivers after payment.
	 */
	async setDigitalAsset(id: number, assetId: number | null): Promise<void> {
		await db.update(products).set({ digitalAssetId: assetId }).where(eq(products.id, id));
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

		// When setting isFeatured to true, un-feature all other variants for the same product
		if (input.isFeatured) {
			await db
				.update(productVariants)
				.set({ isFeatured: false })
				.where(
					and(
						eq(productVariants.productId, variant.productId),
						eq(productVariants.isFeatured, true)
					)
				);
		}

		const updateData: Record<string, unknown> = {};
		if (input.sku !== undefined) updateData.sku = input.sku;
		if (input.price !== undefined) updateData.price = input.price;
		if (input.stock !== undefined) updateData.stock = input.stock;
		if (input.trackInventory !== undefined) updateData.trackInventory = input.trackInventory;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
		if (input.isFeatured !== undefined) updateData.isFeatured = input.isFeatured;

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

	private resolveVariantFallbackImage(variants: ProductVariantWithRelations[]): string | null {
		const featured = variants.find((v) => v.isFeatured && v.imageUrl);
		if (featured) return featured.imageUrl;
		const first = variants.find((v) => v.imageUrl);
		return first?.imageUrl ?? null;
	}

	private async loadProductRelations(product: Product): Promise<ProductWithRelations> {
		const [loaded] = await this.loadProductsRelations([product]);
		return loaded;
	}

	/**
	 * Load relations for many products in a fixed number of batched queries.
	 * Per-row lookups are cheap on local SQLite but each query is a network
	 * round trip on D1, so this stays at 5 queries however many products
	 * (and variants/facets/assets) are involved.
	 *
	 * Public because collectionService hydrates its product lists through this
	 * too — there must be exactly one implementation of this loader.
	 */
	async loadProductsRelations(productList: Product[]): Promise<ProductWithRelations[]> {
		if (productList.length === 0) return [];
		const productIds = productList.map((p) => p.id);
		const featuredAssetIds = productList
			.map((p) => p.featuredAssetId)
			.filter((id): id is number => id !== null);

		const [variantRows, productFacetRows, assetRows, featuredAssetRows] = await Promise.all([
			db
				.select()
				.from(productVariants)
				.where(
					and(
						inArray(productVariants.productId, productIds),
						isNull(productVariants.deletedAt)
					)
				)
				.orderBy(desc(productVariants.isFeatured), asc(productVariants.id)),
			db
				.select({ productId: productFacetValues.productId, value: facetValues })
				.from(productFacetValues)
				.innerJoin(facetValues, eq(facetValues.id, productFacetValues.facetValueId))
				.where(inArray(productFacetValues.productId, productIds))
				.orderBy(asc(facetValues.id)),
			db
				.select({ productId: productAssets.productId, asset: assets })
				.from(productAssets)
				.innerJoin(assets, eq(assets.id, productAssets.assetId))
				.where(inArray(productAssets.productId, productIds))
				.orderBy(asc(productAssets.position)),
			featuredAssetIds.length > 0
				? db.select().from(assets).where(inArray(assets.id, featuredAssetIds))
				: []
		]);

		// Variant facet values need the variant ids from the first round
		const variantIds = variantRows.map((v) => v.id);
		const variantFacetRows =
			variantIds.length > 0
				? await db
						.select({ variantId: variantFacetValues.variantId, value: facetValues })
						.from(variantFacetValues)
						.innerJoin(facetValues, eq(facetValues.id, variantFacetValues.facetValueId))
						.where(inArray(variantFacetValues.variantId, variantIds))
						.orderBy(asc(facetValues.id))
				: [];

		const facetsByVariant = new Map<number, FacetValue[]>();
		for (const row of variantFacetRows) {
			const list = facetsByVariant.get(row.variantId) ?? [];
			list.push(row.value);
			facetsByVariant.set(row.variantId, list);
		}

		const variantsByProduct = new Map<number, ProductVariantWithRelations[]>();
		for (const v of variantRows) {
			const list = variantsByProduct.get(v.productId) ?? [];
			list.push({
				...v,
				facetValues: facetsByVariant.get(v.id) ?? [],
				assets: [],
				featuredAsset: null
			});
			variantsByProduct.set(v.productId, list);
		}

		const facetsByProduct = new Map<number, FacetValue[]>();
		for (const row of productFacetRows) {
			const list = facetsByProduct.get(row.productId) ?? [];
			list.push(row.value);
			facetsByProduct.set(row.productId, list);
		}

		const assetsByProduct = new Map<number, (typeof assetRows)[number]["asset"][]>();
		for (const row of assetRows) {
			const list = assetsByProduct.get(row.productId) ?? [];
			list.push(row.asset);
			assetsByProduct.set(row.productId, list);
		}

		const featuredById = new Map(featuredAssetRows.map((a) => [a.id, a]));

		return productList.map((product) => {
			const variants = variantsByProduct.get(product.id) ?? [];

			// Featured asset, falling back to variant image
			let featuredAsset =
				(product.featuredAssetId ? featuredById.get(product.featuredAssetId) : null) ??
				null;

			if (!featuredAsset) {
				const fallbackUrl = this.resolveVariantFallbackImage(variants);
				if (fallbackUrl) {
					featuredAsset = {
						id: 0,
						name: "",
						type: "image" as const,
						mimeType: "image/jpeg",
						width: 0,
						height: 0,
						fileSize: 0,
						source: fallbackUrl,
						alt: null,
						focalX: 0.5,
						focalY: 0.5,
						createdAt: product.createdAt
					};
				}
			}

			return {
				...product,
				variants,
				facetValues: facetsByProduct.get(product.id) ?? [],
				assets: assetsByProduct.get(product.id) ?? [],
				featuredAsset
			};
		});
	}

	private async loadVariantRelations(
		variant: ProductVariant
	): Promise<ProductVariantWithRelations> {
		const facetRows = await db
			.select({ value: facetValues })
			.from(variantFacetValues)
			.innerJoin(facetValues, eq(facetValues.id, variantFacetValues.facetValueId))
			.where(eq(variantFacetValues.variantId, variant.id))
			.orderBy(asc(facetValues.id));

		return {
			...variant,
			facetValues: facetRows.map((r) => r.value),
			assets: [],
			featuredAsset: null
		};
	}

	private async getProductIdsByFacets(facetFilters: Record<string, string[]>): Promise<number[]> {
		const groups = Object.entries(facetFilters).filter(([, codes]) => codes.length > 0);
		if (groups.length === 0) return [];

		const valueRows = await db
			.select({
				valueId: facetValues.id,
				valueCode: facetValues.code,
				facetCode: facets.code
			})
			.from(facetValues)
			.innerJoin(facets, eq(facets.id, facetValues.facetId))
			.where(
				inArray(
					facets.code,
					groups.map(([code]) => code)
				)
			);

		// Same semantics as the FTS path: facets are AND'd, values within a facet
		// are OR'd. Unknown facets/values are skipped rather than matching nothing.
		const allValueIds: number[] = [];
		let facetCount = 0;
		for (const [facetCode, valueCodes] of groups) {
			const ids = valueRows
				.filter((r) => r.facetCode === facetCode && valueCodes.includes(r.valueCode))
				.map((r) => r.valueId);
			if (ids.length === 0) continue;
			allValueIds.push(...ids);
			facetCount++;
		}

		if (allValueIds.length === 0) return [];

		const productMatches = await db
			.select({ productId: productFacetValues.productId })
			.from(productFacetValues)
			.innerJoin(facetValues, eq(facetValues.id, productFacetValues.facetValueId))
			.where(inArray(productFacetValues.facetValueId, allValueIds))
			.groupBy(productFacetValues.productId)
			.having(sql`count(distinct ${facetValues.facetId}) = ${facetCount}`);

		return productMatches.map((p) => p.productId);
	}

	private async searchProductIds(search: string): Promise<number[]> {
		const searchPattern = `%${search}%`;

		const matches = await db
			.select({ id: products.id })
			.from(products)
			.where(
				sql`(${products.name} LIKE ${searchPattern} OR ${products.description} LIKE ${searchPattern})`
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
				image: assets.source,
				variantImageUrl: productVariants.imageUrl,
				variantIsFeatured: productVariants.isFeatured
			})
			.from(products)
			.leftJoin(
				productVariants,
				and(eq(productVariants.productId, products.id), isNull(productVariants.deletedAt))
			)
			.leftJoin(assets, eq(assets.id, products.featuredAssetId))
			.where(isNull(products.deletedAt))
			.orderBy(asc(products.name));

		// Deduplicate by product id (multiple variants produce multiple rows), keep lowest price
		const seen = new Map<
			number,
			{
				id: number;
				name: string;
				slug: string;
				price: number;
				image: string | null;
				featuredVariantImage: string | null;
				firstVariantImage: string | null;
			}
		>();
		for (const row of rows) {
			const existing = seen.get(row.id);
			if (!existing) {
				seen.set(row.id, {
					id: row.id,
					name: row.name,
					slug: row.slug,
					price: row.price ?? 0,
					image: row.image,
					featuredVariantImage:
						row.variantIsFeatured && row.variantImageUrl ? row.variantImageUrl : null,
					firstVariantImage: row.variantImageUrl ?? null
				});
			} else {
				if (row.price !== null && row.price < existing.price) {
					existing.price = row.price;
				}
				if (row.variantIsFeatured && row.variantImageUrl) {
					existing.featuredVariantImage = row.variantImageUrl;
				}
				if (!existing.firstVariantImage && row.variantImageUrl) {
					existing.firstVariantImage = row.variantImageUrl;
				}
			}
		}

		return [...seen.values()].map(
			({ id, name, slug, price, image, featuredVariantImage, firstVariantImage }) => ({
				id,
				name,
				slug,
				price,
				image: image ?? featuredVariantImage ?? firstVariantImage
			})
		);
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
