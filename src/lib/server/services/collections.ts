/**
 * Collection Service
 * Smart Collections (Vendure/Shopify style) - products derived dynamically from rules
 */
import { eq, and, desc, sql, inArray, isNull, gte, lte, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	collections,
	collectionFilters,
	products,
	productVariants,
	productFacetValues,
	variantFacetValues,
	facetValues,
	productAssets,
	assets
} from "../db/schema.js";
import type {
	Collection,
	CollectionWithRelations,
	CollectionFilter,
	CollectionFilterField,
	CollectionFilterOperator,
	CreateCollectionInput,
	UpdateCollectionInput,
	ProductWithRelations,
	PaginatedResult
} from "$lib/types.js";

// Type for filter handler functions
type FilterHandler = (
	productIds: Set<number> | null,
	filter: CollectionFilter
) => Promise<Set<number>>;

/** Collection with product count */
export interface CollectionWithCount extends Collection {
	productCount: number;
	featuredAsset?: {
		id: number;
		name: string;
		type: string;
		mimeType: string;
		width: number | null;
		height: number | null;
		fileSize: number | null;
		source: string;
		alt: string | null;
		createdAt: Date;
	} | null;
}

export class CollectionService {
	// =========================================================================
	// FILTER HANDLERS - Strategy pattern for filter compilation
	// =========================================================================

	/**
	 * Filter handlers map - each handler returns matching product IDs
	 */
	private filterHandlers: Record<CollectionFilterField, FilterHandler> = {
		/**
		 * Facet filter - get products with specified facet value IDs
		 * value: number[] (array of facet value IDs)
		 */
		facet: async (_currentIds, filter) => {
			const facetValueIds = filter.value as number[];
			if (!facetValueIds || facetValueIds.length === 0) {
				return new Set<number>();
			}

			// Get products matching product-level facets
			const productMatches = await db
				.selectDistinct({ productId: productFacetValues.productId })
				.from(productFacetValues)
				.where(inArray(productFacetValues.facetValueId, facetValueIds));

			// Get products matching variant-level facets
			const variantMatches = await db
				.selectDistinct({ productId: productVariants.productId })
				.from(variantFacetValues)
				.innerJoin(productVariants, eq(variantFacetValues.variantId, productVariants.id))
				.where(inArray(variantFacetValues.facetValueId, facetValueIds));

			const productIds = new Set<number>();
			productMatches.forEach((r) => productIds.add(r.productId));
			variantMatches.forEach((r) => productIds.add(r.productId));

			return productIds;
		},

		/**
		 * Visibility filter - get products by visibility
		 * value: "public" | "private" | "draft"
		 */
		visibility: async (_currentIds, filter) => {
			const visibility = filter.value as "public" | "private" | "draft";

			const matches = await db
				.selectDistinct({ id: products.id })
				.from(products)
				.where(and(eq(products.visibility, visibility), isNull(products.deletedAt)));

			return new Set(matches.map((r) => r.id));
		},

		/**
		 * Price filter - get products with variants in price range
		 * value: number (price in cents)
		 * operator: 'gte' | 'lte'
		 */
		price: async (_currentIds, filter) => {
			const price = filter.value as number;
			const operator = filter.operator as CollectionFilterOperator;

			let condition;
			if (operator === "gte") {
				condition = gte(productVariants.price, price);
			} else if (operator === "lte") {
				condition = lte(productVariants.price, price);
			} else {
				return new Set<number>();
			}

			const matches = await db
				.selectDistinct({ productId: productVariants.productId })
				.from(productVariants)
				.innerJoin(products, eq(productVariants.productId, products.id))
				.where(
					and(condition, isNull(productVariants.deletedAt), isNull(products.deletedAt))
				);

			return new Set(matches.map((r) => r.productId));
		},

		/**
		 * Stock filter - get products with variants in stock
		 * value: number (minimum stock)
		 * operator: 'gt'
		 */
		stock: async (_currentIds, filter) => {
			const minStock = filter.value as number;

			const matches = await db
				.selectDistinct({ productId: productVariants.productId })
				.from(productVariants)
				.innerJoin(products, eq(productVariants.productId, products.id))
				.where(
					and(
						gt(productVariants.stock, minStock),
						isNull(productVariants.deletedAt),
						isNull(products.deletedAt)
					)
				);

			return new Set(matches.map((r) => r.productId));
		},

		/**
		 * Product filter - manual product selection
		 * value: number[] (array of product IDs)
		 */
		product: async (_currentIds, filter) => {
			const productIds = filter.value as number[];
			if (!productIds || productIds.length === 0) {
				return new Set<number>();
			}

			// Verify products exist and are not deleted
			const matches = await db
				.select({ id: products.id })
				.from(products)
				.where(and(inArray(products.id, productIds), isNull(products.deletedAt)));

			return new Set(matches.map((r) => r.id));
		},

		/**
		 * Variant filter - manual variant selection (returns their products)
		 * value: number[] (array of variant IDs)
		 */
		variant: async (_currentIds, filter) => {
			const variantIds = filter.value as number[];
			if (!variantIds || variantIds.length === 0) {
				return new Set<number>();
			}

			const matches = await db
				.selectDistinct({ productId: productVariants.productId })
				.from(productVariants)
				.innerJoin(products, eq(productVariants.productId, products.id))
				.where(
					and(
						inArray(productVariants.id, variantIds),
						isNull(productVariants.deletedAt),
						isNull(products.deletedAt)
					)
				);

			return new Set(matches.map((r) => r.productId));
		}
	};

	// =========================================================================
	// CRUD OPERATIONS
	// =========================================================================

	/**
	 * Create a new collection
	 */
	async create(input: CreateCollectionInput): Promise<CollectionWithRelations> {
		const [collection] = await db
			.insert(collections)
			.values({
				name: input.name,
				slug: input.slug,
				description: input.description,
				isPrivate: input.isPrivate ?? false,
				position: input.position ?? 0,
				featuredAssetId: input.featuredAssetId
			})
			.returning();

		// Insert filters
		if (input.filters && input.filters.length > 0) {
			await db.insert(collectionFilters).values(
				input.filters.map((f) => ({
					collectionId: collection.id,
					field: f.field,
					operator: f.operator,
					value: f.value
				}))
			);
		}

		return this.getById(collection.id) as Promise<CollectionWithRelations>;
	}

	/**
	 * Update an existing collection
	 */
	async update(
		id: number,
		input: UpdateCollectionInput
	): Promise<CollectionWithRelations | null> {
		const existing = await this.getById(id);
		if (!existing) return null;

		// Update main collection
		const updateData: Record<string, unknown> = {};
		if (input.isPrivate !== undefined) updateData.isPrivate = input.isPrivate;
		if (input.position !== undefined) updateData.position = input.position;
		if (input.featuredAssetId !== undefined) updateData.featuredAssetId = input.featuredAssetId;
		if (input.name !== undefined) updateData.name = input.name;
		if (input.slug !== undefined) updateData.slug = input.slug;
		if (input.description !== undefined) updateData.description = input.description;

		if (Object.keys(updateData).length > 0) {
			await db.update(collections).set(updateData).where(eq(collections.id, id));
		}

		return this.getById(id);
	}

	/**
	 * Delete a collection
	 */
	async delete(id: number): Promise<boolean> {
		const result = await db.delete(collections).where(eq(collections.id, id)).returning();
		return result.length > 0;
	}

	// =========================================================================
	// RETRIEVAL METHODS
	// =========================================================================

	/**
	 * Get a collection by ID with all relations
	 */
	async getById(id: number): Promise<CollectionWithRelations | null> {
		const collection = await db
			.select()
			.from(collections)
			.where(eq(collections.id, id))
			.limit(1);

		if (!collection[0]) return null;

		return this.loadCollectionRelations(collection[0]);
	}

	/**
	 * Get a collection by slug
	 */
	async getBySlug(slug: string): Promise<CollectionWithRelations | null> {
		const collection = await db
			.select()
			.from(collections)
			.where(eq(collections.slug, slug))
			.limit(1);

		if (!collection[0]) return null;

		return this.loadCollectionRelations(collection[0]);
	}

	/**
	 * List all collections (for admin)
	 */
	async listAll(): Promise<CollectionWithRelations[]> {
		const collectionList = await db
			.select()
			.from(collections)
			.orderBy(collections.position, desc(collections.createdAt));

		return Promise.all(collectionList.map((c) => this.loadCollectionRelations(c)));
	}

	/**
	 * List public collections (for storefront)
	 */
	async list(): Promise<CollectionWithCount[]> {
		const collectionList = await db
			.select()
			.from(collections)
			.where(eq(collections.isPrivate, false))
			.orderBy(collections.position, desc(collections.createdAt));

		// Load counts and featured assets
		return Promise.all(
			collectionList.map(async (c) => {
				const [productCount, featuredAsset] = await Promise.all([
					this.getProductCount(c.id),
					c.featuredAssetId
						? db.select().from(assets).where(eq(assets.id, c.featuredAssetId)).limit(1)
						: Promise.resolve([])
				]);
				return {
					...c,
					productCount,
					featuredAsset: featuredAsset[0] ?? null
				};
			})
		);
	}

	// =========================================================================
	// FILTER MANAGEMENT
	// =========================================================================

	/**
	 * Add a filter to a collection
	 */
	async addFilter(
		collectionId: number,
		filter: { field: CollectionFilterField; operator: CollectionFilterOperator; value: unknown }
	): Promise<CollectionFilter> {
		const [inserted] = await db
			.insert(collectionFilters)
			.values({
				collectionId,
				field: filter.field,
				operator: filter.operator,
				value: filter.value
			})
			.returning();

		return inserted;
	}

	/**
	 * Remove a filter from a collection
	 */
	async removeFilter(filterId: number): Promise<boolean> {
		const result = await db
			.delete(collectionFilters)
			.where(eq(collectionFilters.id, filterId))
			.returning();
		return result.length > 0;
	}

	/**
	 * Update a filter
	 */
	async updateFilter(
		filterId: number,
		filter: {
			field?: CollectionFilterField;
			operator?: CollectionFilterOperator;
			value?: unknown;
		}
	): Promise<CollectionFilter | null> {
		const updateData: Partial<CollectionFilter> = {};
		if (filter.field !== undefined) updateData.field = filter.field;
		if (filter.operator !== undefined) updateData.operator = filter.operator;
		if (filter.value !== undefined) updateData.value = filter.value;

		const [updated] = await db
			.update(collectionFilters)
			.set(updateData)
			.where(eq(collectionFilters.id, filterId))
			.returning();

		return updated ?? null;
	}

	/**
	 * Replace all filters for a collection (bulk delete + insert)
	 */
	async replaceFilters(
		collectionId: number,
		filters: {
			field: CollectionFilterField;
			operator: CollectionFilterOperator;
			value: unknown;
		}[]
	): Promise<void> {
		await db.delete(collectionFilters).where(eq(collectionFilters.collectionId, collectionId));

		if (filters.length > 0) {
			await db.insert(collectionFilters).values(
				filters.map((f) => ({
					collectionId,
					field: f.field,
					operator: f.operator,
					value: f.value
				}))
			);
		}
	}

	// =========================================================================
	// DYNAMIC PRODUCT RESOLUTION (THE KEY METHOD)
	// =========================================================================

	/**
	 * Get products for a collection by applying filters dynamically
	 */
	async getProductsForCollection(
		collectionId: number,
		options: { limit?: number; offset?: number } = {}
	): Promise<PaginatedResult<ProductWithRelations>> {
		const { limit = 20, offset = 0 } = options;

		// Load filters for this collection
		const filters = await db
			.select()
			.from(collectionFilters)
			.where(eq(collectionFilters.collectionId, collectionId));

		// If no filters, return empty result
		if (filters.length === 0) {
			return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
		}

		// Apply filters to get matching product IDs
		let matchingProductIds: Set<number> | null = null;

		for (const filter of filters) {
			const handler = this.filterHandlers[filter.field as CollectionFilterField];
			if (handler) {
				const filterResults = await handler(matchingProductIds, filter);

				// AND logic: intersect with previous results
				if (matchingProductIds === null) {
					matchingProductIds = filterResults;
				} else {
					const currentIds: Set<number> = matchingProductIds;
					matchingProductIds = new Set(
						[...currentIds].filter((id) => filterResults.has(id))
					);
				}

				// Short circuit if no matches
				if (matchingProductIds.size === 0) {
					return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
				}
			}
		}

		if (!matchingProductIds || matchingProductIds.size === 0) {
			return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
		}

		const productIdArray = [...matchingProductIds];
		const total = productIdArray.length;

		// Fetch paginated products
		const productList = await db
			.select()
			.from(products)
			.where(and(inArray(products.id, productIdArray), isNull(products.deletedAt)))
			.orderBy(desc(products.createdAt))
			.limit(limit)
			.offset(offset);

		// Load full relations
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
	 * Preview what products would match given filters (for admin UI)
	 */
	async previewFilters(
		filters: {
			field: CollectionFilterField;
			operator: CollectionFilterOperator;
			value: unknown;
		}[],
		options: { limit?: number } = {}
	): Promise<{ products: ProductWithRelations[]; total: number }> {
		const { limit = 10 } = options;

		if (filters.length === 0) {
			return { products: [], total: 0 };
		}

		// Apply filters
		let matchingProductIds: Set<number> | null = null;

		for (const filter of filters) {
			const handler = this.filterHandlers[filter.field];
			if (handler) {
				const mockFilter = {
					id: 0,
					collectionId: 0,
					field: filter.field,
					operator: filter.operator,
					value: filter.value,
					createdAt: new Date()
				};
				const filterResults = await handler(matchingProductIds, mockFilter);

				if (matchingProductIds === null) {
					matchingProductIds = filterResults;
				} else {
					const currentIds: Set<number> = matchingProductIds;
					matchingProductIds = new Set(
						[...currentIds].filter((id) => filterResults.has(id))
					);
				}

				if (matchingProductIds.size === 0) {
					return { products: [], total: 0 };
				}
			}
		}

		if (!matchingProductIds || matchingProductIds.size === 0) {
			return { products: [], total: 0 };
		}

		const productIdArray = [...matchingProductIds];
		const total = productIdArray.length;

		// Fetch limited products for preview
		const productList = await db
			.select()
			.from(products)
			.where(and(inArray(products.id, productIdArray), isNull(products.deletedAt)))
			.orderBy(desc(products.createdAt))
			.limit(limit);

		const items = await Promise.all(productList.map((p) => this.loadProductRelations(p)));

		return { products: items, total };
	}

	/**
	 * Get count of products in a collection
	 */
	async getProductCount(collectionId: number): Promise<number> {
		const result = await this.getProductsForCollection(collectionId, {
			limit: 1000000,
			offset: 0
		});
		return result.pagination.total;
	}

	/**
	 * Get all collections that contain a given product
	 */
	async getCollectionsForProduct(productId: number): Promise<CollectionWithRelations[]> {
		const allCollections = await db
			.select()
			.from(collections)
			.orderBy(collections.position, desc(collections.createdAt));

		const matched: CollectionWithRelations[] = [];

		for (const collection of allCollections) {
			const filters = await db
				.select()
				.from(collectionFilters)
				.where(eq(collectionFilters.collectionId, collection.id));

			if (filters.length === 0) continue;

			let matchingProductIds: Set<number> | null = null;

			for (const filter of filters) {
				const handler = this.filterHandlers[filter.field as CollectionFilterField];
				if (handler) {
					const filterResults = await handler(matchingProductIds, filter);
					if (matchingProductIds === null) {
						matchingProductIds = filterResults;
					} else {
						const currentIds: Set<number> = matchingProductIds;
						matchingProductIds = new Set(
							[...currentIds].filter((id) => filterResults.has(id))
						);
					}
					if (matchingProductIds.size === 0) break;
				}
			}

			if (matchingProductIds?.has(productId)) {
				const raw = await this.loadCollectionRelations(collection);
				matched.push(raw);
			}
		}

		return matched;
	}

	// =========================================================================
	// PRIVATE HELPER METHODS
	// =========================================================================

	/**
	 * Load collection with all relations
	 */
	private async loadCollectionRelations(
		collection: Collection
	): Promise<CollectionWithRelations> {
		const [filters, featuredAsset] = await Promise.all([
			db
				.select()
				.from(collectionFilters)
				.where(eq(collectionFilters.collectionId, collection.id)),
			collection.featuredAssetId
				? db.select().from(assets).where(eq(assets.id, collection.featuredAssetId)).limit(1)
				: Promise.resolve([])
		]);

		return {
			...collection,
			filters,
			featuredAsset: featuredAsset[0] ?? null
		};
	}

	/**
	 * Load product with all relations (copied from ProductService for self-containment)
	 */
	private async loadProductRelations(
		product: typeof products.$inferSelect
	): Promise<ProductWithRelations> {
		// Load variants with their relations
		const variantList = await db
			.select()
			.from(productVariants)
			.where(
				and(eq(productVariants.productId, product.id), isNull(productVariants.deletedAt))
			);

		const variants = await Promise.all(
			variantList.map(async (v) => {
				const variantFacetValueIds = await db
					.select({ facetValueId: variantFacetValues.facetValueId })
					.from(variantFacetValues)
					.where(eq(variantFacetValues.variantId, v.id));

				const variantFacetValuesData =
					variantFacetValueIds.length > 0
						? await db
								.select()
								.from(facetValues)
								.where(
									inArray(
										facetValues.id,
										variantFacetValueIds.map((fv) => fv.facetValueId)
									)
								)
						: [];

				return {
					...v,
					facetValues: variantFacetValuesData,
					assets: [],
					featuredAsset: null
				};
			})
		);

		// Load product facet values
		const productFacetValueIds = await db
			.select({ facetValueId: productFacetValues.facetValueId })
			.from(productFacetValues)
			.where(eq(productFacetValues.productId, product.id));

		const productFacetValuesData =
			productFacetValueIds.length > 0
				? await db
						.select()
						.from(facetValues)
						.where(
							inArray(
								facetValues.id,
								productFacetValueIds.map((fv) => fv.facetValueId)
							)
						)
				: [];

		// Load assets
		const productAssetsList = await db
			.select({ asset: assets, position: productAssets.position })
			.from(productAssets)
			.innerJoin(assets, eq(productAssets.assetId, assets.id))
			.where(eq(productAssets.productId, product.id))
			.orderBy(productAssets.position);

		const productAssetsData = productAssetsList.map((pa) => pa.asset);

		// Load featured asset
		const featuredAsset = product.featuredAssetId
			? await db.select().from(assets).where(eq(assets.id, product.featuredAssetId)).limit(1)
			: [];

		return {
			...product,
			variants,
			facetValues: productFacetValuesData,
			assets: productAssetsData,
			featuredAsset: featuredAsset[0] ?? null
		};
	}
}

// Export singleton instance
export const collectionService = new CollectionService();
