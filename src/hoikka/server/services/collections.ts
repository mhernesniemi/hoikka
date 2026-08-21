/**
 * Collection Service
 * Smart Collections (Vendure/Shopify style) - products derived dynamically from rules
 */
import { eq, and, asc, desc, sql, inArray, isNull, gte, lte, gt, type SQL } from "drizzle-orm";
import { db, atomic } from "../db/index.js";
import { paginationOf, resolveSort } from "../pagination.js";
import {
	collections,
	collectionFilters,
	products,
	productVariants,
	productFacetValues,
	variantFacetValues,
	assets
} from "../db/schema.js";
import type {
	Collection,
	CollectionWithRelations,
	CollectionListItem,
	CollectionFilter,
	CollectionFilterField,
	CollectionFilterOperator,
	CreateCollectionInput,
	UpdateCollectionInput,
	ProductWithRelations,
	PaginatedResult
} from "@hoikka/core/shared/types";
import { productService } from "./products.js";

// Type for filter handler functions. Handlers only read field/operator/value,
// so previews can pass unsaved filters without faking a full row.
type FilterHandler = (
	productIds: Set<number> | null,
	filter: Pick<CollectionFilter, "field" | "operator" | "value">
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
		if (input.customFields !== undefined) {
			updateData.customFields = { ...existing.customFields, ...input.customFields };
		}

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
	 * List collections with server-side pagination for admin list view.
	 */
	async listPaginated(
		options: {
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<CollectionListItem>> {
		const { limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;

		const conditions: SQL[] = [];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(sql`${collections.name} LIKE ${pattern}`);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(collections)
			.where(whereClause);
		const total = Number(countResult?.count ?? 0);

		const orderByExpr = resolveSort(
			{
				name: sql`${collections.name}`,
				status: sql`${collections.isPrivate}`,
				createdAt: sql`${collections.createdAt}`
			},
			sortBy,
			sortOrder
		);

		const items = await db
			.select({
				id: collections.id,
				name: collections.name,
				isPrivate: collections.isPrivate,
				createdAt: collections.createdAt
			})
			.from(collections)
			.where(whereClause)
			.orderBy(
				...(orderByExpr
					? [orderByExpr]
					: [asc(collections.position), desc(collections.createdAt)])
			)
			.limit(limit)
			.offset(offset);

		// Compute product counts only for items on this page
		const itemsWithCounts = await Promise.all(
			items.map(async (item) => ({
				...item,
				productCount: await this.getProductCount(item.id)
			}))
		);

		return {
			items: itemsWithCounts,
			pagination: paginationOf(total, limit, offset, items.length)
		};
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
		await atomic([
			db.delete(collectionFilters).where(eq(collectionFilters.collectionId, collectionId)),
			...(filters.length > 0
				? [
						db.insert(collectionFilters).values(
							filters.map((f) => ({
								collectionId,
								field: f.field,
								operator: f.operator,
								value: f.value
							}))
						)
					]
				: [])
		]);
	}

	// =========================================================================
	// DYNAMIC PRODUCT RESOLUTION (THE KEY METHOD)
	// =========================================================================

	/**
	 * Evaluate a filter list: each filter's matches are intersected (AND).
	 * The single implementation behind every "which products match" question.
	 */
	private async resolveFilters(
		filters: Pick<CollectionFilter, "field" | "operator" | "value">[]
	): Promise<Set<number>> {
		let matchingProductIds: Set<number> | null = null;

		for (const filter of filters) {
			const handler = this.filterHandlers[filter.field as CollectionFilterField];
			if (!handler) continue;

			const filterResults = await handler(matchingProductIds, filter);
			if (matchingProductIds === null) {
				matchingProductIds = filterResults;
			} else {
				const intersection = new Set<number>();
				for (const id of matchingProductIds) {
					if (filterResults.has(id)) intersection.add(id);
				}
				matchingProductIds = intersection;
			}

			if (matchingProductIds.size === 0) return matchingProductIds;
		}

		return matchingProductIds ?? new Set();
	}

	/**
	 * Get all matching product IDs for a collection (evaluates filters, no pagination).
	 */
	async getProductIdsForCollection(collectionId: number): Promise<number[]> {
		const filters = await db
			.select()
			.from(collectionFilters)
			.where(eq(collectionFilters.collectionId, collectionId));

		if (filters.length === 0) return [];

		return [...(await this.resolveFilters(filters))];
	}

	async getProductsForCollection(
		collectionId: number,
		options: { limit?: number; offset?: number } = {}
	): Promise<PaginatedResult<ProductWithRelations>> {
		const { limit = 20, offset = 0 } = options;

		const productIdArray = await this.getProductIdsForCollection(collectionId);

		if (productIdArray.length === 0) {
			return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };
		}

		const total = productIdArray.length;

		// Fetch paginated products
		const productList = await db
			.select()
			.from(products)
			.where(and(inArray(products.id, productIdArray), isNull(products.deletedAt)))
			.orderBy(desc(products.createdAt))
			.limit(limit)
			.offset(offset);

		// Hydrate through the products service's batched loader (fixed query count on D1)
		const items = await productService.loadProductsRelations(productList);

		return {
			items,
			pagination: paginationOf(total, limit, offset, items.length)
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

		const matchingProductIds = await this.resolveFilters(filters);
		if (matchingProductIds.size === 0) {
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

		const items = await productService.loadProductsRelations(productList);

		return { products: items, total };
	}

	/**
	 * Get count of products in a collection
	 */
	async getProductCount(collectionId: number): Promise<number> {
		return (await this.getProductIdsForCollection(collectionId)).length;
	}

	/**
	 * Get all collections that contain a given product
	 */
	async getCollectionsForProduct(productId: number): Promise<CollectionWithRelations[]> {
		const [allCollections, allFilters] = await Promise.all([
			db
				.select()
				.from(collections)
				.orderBy(collections.position, desc(collections.createdAt)),
			db.select().from(collectionFilters)
		]);

		const filtersByCollection = new Map<number, CollectionFilter[]>();
		for (const filter of allFilters) {
			const list = filtersByCollection.get(filter.collectionId) ?? [];
			list.push(filter);
			filtersByCollection.set(filter.collectionId, list);
		}

		const matched: CollectionWithRelations[] = [];

		for (const collection of allCollections) {
			const filters = filtersByCollection.get(collection.id);
			if (!filters || filters.length === 0) continue;

			const matchingProductIds = await this.resolveFilters(filters);
			if (matchingProductIds.has(productId)) {
				matched.push(await this.loadCollectionRelations(collection));
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
}

// Export singleton instance
export const collectionService = new CollectionService();
