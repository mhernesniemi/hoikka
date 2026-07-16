/**
 * Promotion Service
 * Handles coupon codes and discounts
 */
import { eq, and, asc, desc, sql, gte, lte, or, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	promotions,
	promotionProducts,
	promotionCollections,
	orderPromotions,
	orders,
	productTranslations,
	collectionTranslations,
	collectionFilters,
	productFacetValues,
	customerGroupMembers
} from "../db/schema.js";
import type {
	Promotion,
	CreatePromotionInput,
	UpdatePromotionInput,
	PromotionWithRelations,
	PaginatedResult
} from "$lib/types.js";
import { calculateDiscount, canCombinePromotions } from "./promotion-utils.js";

export class PromotionService {
	/**
	 * Create a new promotion
	 */
	async create(input: CreatePromotionInput): Promise<Promotion> {
		const method = input.method ?? "code";

		const [promotion] = await db
			.insert(promotions)
			.values({
				method,
				code: method === "automatic" ? null : (input.code?.toUpperCase() ?? null),
				title: input.title ?? null,
				promotionType: input.promotionType ?? "order",
				discountType: input.discountType,
				discountValue: input.discountValue,
				appliesTo: input.appliesTo ?? "all",
				minOrderAmount: input.minOrderAmount,
				usageLimit: input.usageLimit,
				usageLimitPerCustomer: input.usageLimitPerCustomer,
				combinesWithOtherPromotions: input.combinesWithOtherPromotions ?? false,
				customerGroupId: input.customerGroupId ?? null,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				enabled: true,
				usageCount: 0
			})
			.returning();

		// Insert junction table rows
		if (input.productIds?.length) {
			await db.insert(promotionProducts).values(
				input.productIds.map((productId) => ({
					promotionId: promotion.id,
					productId
				}))
			);
		}

		if (input.collectionIds?.length) {
			await db.insert(promotionCollections).values(
				input.collectionIds.map((collectionId) => ({
					promotionId: promotion.id,
					collectionId
				}))
			);
		}

		this.clearDiscountsCache();
		return promotion;
	}

	/**
	 * Get promotion by ID
	 */
	async getById(id: number): Promise<Promotion | null> {
		const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id));

		return promotion ?? null;
	}

	/**
	 * Get promotion by ID with related products and collections
	 */
	async getByIdWithRelations(id: number): Promise<PromotionWithRelations | null> {
		const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id));

		if (!promotion) return null;

		// Get related products with names
		const relatedProducts = await db
			.select({
				productId: promotionProducts.productId,
				productName: productTranslations.name
			})
			.from(promotionProducts)
			.leftJoin(
				productTranslations,
				and(
					eq(promotionProducts.productId, productTranslations.productId),
					eq(productTranslations.languageCode, "fi")
				)
			)
			.where(eq(promotionProducts.promotionId, id));

		// Get related collections with names
		const relatedCollections = await db
			.select({
				collectionId: promotionCollections.collectionId,
				collectionName: collectionTranslations.name
			})
			.from(promotionCollections)
			.leftJoin(
				collectionTranslations,
				and(
					eq(promotionCollections.collectionId, collectionTranslations.collectionId),
					eq(collectionTranslations.languageCode, "fi")
				)
			)
			.where(eq(promotionCollections.promotionId, id));

		return {
			...promotion,
			products: relatedProducts.map((p) => ({
				productId: p.productId,
				productName: p.productName ?? undefined
			})),
			collections: relatedCollections.map((c) => ({
				collectionId: c.collectionId,
				collectionName: c.collectionName ?? undefined
			}))
		};
	}

	/**
	 * Get promotion by code
	 */
	async getByCode(code: string): Promise<Promotion | null> {
		const [promotion] = await db
			.select()
			.from(promotions)
			.where(eq(promotions.code, code.toUpperCase()));

		return promotion ?? null;
	}

	/**
	 * List all promotions
	 */
	async list(
		options: {
			enabled?: boolean;
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<Promotion>> {
		const { enabled, limit = 20, offset = 0, search, sortBy, sortOrder = "desc" } = options;

		const conditions = enabled !== undefined ? [eq(promotions.enabled, enabled)] : [];
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${promotions.code} LIKE ${pattern} OR ${promotions.title} LIKE ${pattern})` as any
			);
		}

		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(promotions)
			.where(and(...conditions));
		const total = Number(countResult[0]?.count ?? 0);

		const sortColumnMap: Record<string, ReturnType<typeof sql>> = {
			code: sql`${promotions.code}`,
			method: sql`${promotions.method}`,
			promotionType: sql`${promotions.promotionType}`,
			status: sql`${promotions.enabled}`,
			createdAt: sql`${promotions.createdAt}`
		};
		const sortCol = (sortBy && sortColumnMap[sortBy]) || sql`${promotions.createdAt}`;
		const dirFn = sortOrder === "asc" ? asc : desc;

		const items = await db
			.select()
			.from(promotions)
			.where(and(...conditions))
			.orderBy(dirFn(sortCol))
			.limit(limit)
			.offset(offset);

		return {
			items,
			pagination: { total, limit, offset, hasMore: offset + items.length < total }
		};
	}

	/**
	 * List active promotions (enabled, within date range, not exhausted)
	 */
	async listActive(): Promise<Promotion[]> {
		const now = new Date();

		const items = await db
			.select()
			.from(promotions)
			.where(
				and(
					eq(promotions.enabled, true),
					or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
					or(isNull(promotions.endsAt), gte(promotions.endsAt, now)),
					or(
						isNull(promotions.usageLimit),
						sql`${promotions.usageCount} < ${promotions.usageLimit}`
					)
				)
			);

		return items;
	}

	/**
	 * Update a promotion
	 */
	async update(id: number, input: UpdatePromotionInput): Promise<Promotion | null> {
		const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id));

		if (!promotion) return null;

		const [updated] = await db
			.update(promotions)
			.set({
				...(input.title !== undefined && { title: input.title }),
				...(input.discountType && { discountType: input.discountType }),
				...(input.discountValue !== undefined && { discountValue: input.discountValue }),
				...(input.appliesTo !== undefined && { appliesTo: input.appliesTo }),
				...(input.minOrderAmount !== undefined && {
					minOrderAmount: input.minOrderAmount
				}),
				...(input.usageLimit !== undefined && { usageLimit: input.usageLimit }),
				...(input.usageLimitPerCustomer !== undefined && {
					usageLimitPerCustomer: input.usageLimitPerCustomer
				}),
				...(input.combinesWithOtherPromotions !== undefined && {
					combinesWithOtherPromotions: input.combinesWithOtherPromotions
				}),
				...(input.customerGroupId !== undefined && {
					customerGroupId: input.customerGroupId
				}),
				...(input.startsAt !== undefined && { startsAt: input.startsAt }),
				...(input.endsAt !== undefined && { endsAt: input.endsAt }),
				...(input.enabled !== undefined && { enabled: input.enabled })
			})
			.where(eq(promotions.id, id))
			.returning();

		// Sync junction tables if provided
		if (input.productIds !== undefined) {
			await db.delete(promotionProducts).where(eq(promotionProducts.promotionId, id));
			if (input.productIds.length > 0) {
				await db.insert(promotionProducts).values(
					input.productIds.map((productId) => ({
						promotionId: id,
						productId
					}))
				);
			}
		}

		if (input.collectionIds !== undefined) {
			await db.delete(promotionCollections).where(eq(promotionCollections.promotionId, id));
			if (input.collectionIds.length > 0) {
				await db.insert(promotionCollections).values(
					input.collectionIds.map((collectionId) => ({
						promotionId: id,
						collectionId
					}))
				);
			}
		}

		this.clearDiscountsCache();
		return updated;
	}

	/**
	 * Enable/disable a promotion
	 */
	async setEnabled(id: number, enabled: boolean): Promise<Promotion | null> {
		return this.update(id, { enabled });
	}

	/**
	 * Delete a promotion
	 */
	async delete(id: number): Promise<boolean> {
		await db.delete(promotions).where(eq(promotions.id, id));
		this.clearDiscountsCache();
		return true;
	}

	/**
	 * Shared validation of a promotion's order conditions (enabled, minimum
	 * amount, per-customer limit, combination rules, customer-group
	 * restriction). Used by both the code path and the automatic path.
	 */
	private async validateConditions(
		promotion: Promotion,
		orderAmount: number,
		options?: {
			customerId?: number;
			existingPromotionIds?: number[];
		}
	): Promise<{ valid: boolean; error?: string }> {
		if (!promotion.enabled) {
			return { valid: false, error: "Promotion is not active" };
		}

		if (promotion.minOrderAmount && orderAmount < promotion.minOrderAmount) {
			return {
				valid: false,
				error: `Minimum order amount of ${promotion.minOrderAmount / 100} required`
			};
		}

		// Per-customer usage check
		if (promotion.usageLimitPerCustomer && options?.customerId) {
			const usageCount = await this.getCustomerUsageCount(promotion.id, options.customerId);
			if (usageCount >= promotion.usageLimitPerCustomer) {
				return { valid: false, error: "You have already used this promotion" };
			}
		}

		// Combination check
		if (options?.existingPromotionIds?.length) {
			const existingPromos = await db
				.select()
				.from(promotions)
				.where(inArray(promotions.id, options.existingPromotionIds));

			if (!canCombinePromotions(existingPromos, promotion)) {
				return {
					valid: false,
					error: "This promotion cannot be combined with other promotions"
				};
			}
		}

		// Customer group restriction check
		if (promotion.customerGroupId) {
			const restricted = {
				valid: false,
				error: "This promotion is restricted to specific customers"
			};
			if (!options?.customerId) return restricted;

			const [membership] = await db
				.select()
				.from(customerGroupMembers)
				.where(
					and(
						eq(customerGroupMembers.customerId, options.customerId),
						eq(customerGroupMembers.groupId, promotion.customerGroupId)
					)
				);
			if (!membership) return restricted;
		}

		return { valid: true };
	}

	/**
	 * Validate a promotion code
	 * Returns the promotion if valid, or an error message if not
	 */
	async validate(
		code: string,
		orderAmount: number,
		options?: {
			customerId?: number;
			existingPromotionIds?: number[];
		}
	): Promise<{ valid: boolean; promotion?: Promotion; error?: string }> {
		const promotion = await this.getByCode(code);

		if (!promotion) {
			return { valid: false, error: "Invalid promotion code" };
		}

		const now = new Date();

		if (promotion.startsAt && promotion.startsAt > now) {
			return { valid: false, error: "Promotion has not started yet" };
		}

		if (promotion.endsAt && promotion.endsAt < now) {
			return { valid: false, error: "Promotion has expired" };
		}

		if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
			return { valid: false, error: "Promotion usage limit reached" };
		}

		const conditions = await this.validateConditions(promotion, orderAmount, options);
		if (!conditions.valid) return conditions;

		return { valid: true, promotion };
	}

	/**
	 * Get product IDs that a promotion applies to
	 * Returns null if applies to all products
	 */
	async getQualifyingProductIds(promotionId: number): Promise<number[] | null> {
		const promotion = await this.getById(promotionId);
		if (!promotion) return null;

		if (promotion.appliesTo === "all") return null;

		if (promotion.appliesTo === "specific_products") {
			const rows = await db
				.select({ productId: promotionProducts.productId })
				.from(promotionProducts)
				.where(eq(promotionProducts.promotionId, promotionId));
			return rows.map((r) => r.productId);
		}

		if (promotion.appliesTo === "specific_collections") {
			// Get collection IDs linked to this promotion
			const collectionRows = await db
				.select({ collectionId: promotionCollections.collectionId })
				.from(promotionCollections)
				.where(eq(promotionCollections.promotionId, promotionId));

			if (collectionRows.length === 0) return [];

			const collectionIds = collectionRows.map((r) => r.collectionId);

			// Get filters for these collections and resolve product IDs
			// Collections use filter-based matching; get products matching the collection filters
			const filters = await db
				.select()
				.from(collectionFilters)
				.where(inArray(collectionFilters.collectionId, collectionIds));

			// For product-type filters (field='product'), extract product IDs directly
			const productIds = new Set<number>();
			for (const filter of filters) {
				if (filter.field === "product" && filter.operator === "in") {
					const ids = filter.value as number[];
					for (const id of ids) productIds.add(id);
				} else if (filter.field === "facet" && filter.operator === "in") {
					// Resolve facet-based filter to product IDs
					const facetValueIds = filter.value as number[];
					if (facetValueIds.length > 0) {
						const facetProducts = await db
							.select({ productId: productFacetValues.productId })
							.from(productFacetValues)
							.where(inArray(productFacetValues.facetValueId, facetValueIds));
						for (const fp of facetProducts) productIds.add(fp.productId);
					}
				}
			}

			return Array.from(productIds);
		}

		return null;
	}

	/**
	 * Get how many completed orders a customer has used a promotion on
	 */
	async getCustomerUsageCount(promotionId: number, customerId: number): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(orderPromotions)
			.innerJoin(orders, eq(orderPromotions.orderId, orders.id))
			.where(
				and(
					eq(orderPromotions.promotionId, promotionId),
					eq(orders.customerId, customerId),
					eq(orders.active, false)
				)
			);

		return Number(result[0]?.count ?? 0);
	}

	/**
	 * List active automatic promotions (enabled, within date range, not exhausted, method=automatic)
	 */
	async listActiveAutomatic(): Promise<Promotion[]> {
		const now = new Date();

		return db
			.select()
			.from(promotions)
			.where(
				and(
					eq(promotions.method, "automatic"),
					eq(promotions.enabled, true),
					or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
					or(isNull(promotions.endsAt), gte(promotions.endsAt, now)),
					or(
						isNull(promotions.usageLimit),
						sql`${promotions.usageCount} < ${promotions.usageLimit}`
					)
				)
			);
	}

	/**
	 * Validate an automatic promotion against order conditions (without code lookup)
	 */
	async validateAutomatic(
		promotion: Promotion,
		orderAmount: number,
		options?: {
			customerId?: number;
			existingPromotionIds?: number[];
		}
	): Promise<{ valid: boolean; error?: string }> {
		return this.validateConditions(promotion, orderAmount, options);
	}

	/**
	 * Calculate discount amount for a promotion
	 */
	calculateDiscount(promotion: Promotion, orderAmount: number): number {
		return calculateDiscount(promotion, orderAmount);
	}

	/**
	 * Get active automatic discounts that apply to products (for storefront display)
	 * Returns lightweight objects with resolved product scopes.
	 *
	 * Runs on every storefront page load, so results are cached briefly
	 * (per server process / Workers isolate). Admin mutations clear the cache.
	 */
	async getActiveProductDiscounts(): Promise<ActiveProductDiscount[]> {
		if (discountsCache && Date.now() < discountsCache.expires) {
			return discountsCache.value;
		}

		const activeAutomatic = await this.listActiveAutomatic();

		// Filter out free_shipping — it doesn't affect product prices
		const priceDiscounts = activeAutomatic.filter((p) => p.promotionType !== "free_shipping");

		const results = await Promise.all(
			priceDiscounts.map(async (p) => ({
				id: p.id,
				title: p.title,
				discountType: p.discountType,
				discountValue: p.discountValue,
				promotionType: p.promotionType,
				productIds: await this.getQualifyingProductIds(p.id)
			}))
		);

		discountsCache = { value: results, expires: Date.now() + DISCOUNTS_CACHE_TTL_MS };
		return results;
	}

	/** Call after any promotion mutation so storefront discounts update immediately. */
	clearDiscountsCache(): void {
		discountsCache = null;
	}
}

interface ActiveProductDiscount {
	id: number;
	title: string | null;
	discountType: string;
	discountValue: number;
	promotionType: string;
	productIds: number[] | null;
}

const DISCOUNTS_CACHE_TTL_MS = 60_000;
let discountsCache: { value: ActiveProductDiscount[]; expires: number } | null = null;

// Export singleton instance
export const promotionService = new PromotionService();
