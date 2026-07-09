/**
 * Review Service
 *
 * Handles product reviews including:
 * - Creating reviews
 * - Getting reviews (for products, customers)
 * - Moderation (approve/reject)
 * - Calculating average ratings
 */
import { eq, and, asc, desc, sql, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { reviews, products, customers, orders, orderLines, productVariants } from "../db/schema.js";
import type {
	Review,
	ReviewWithCustomer,
	ReviewWithRelations,
	ReviewStatus,
	CreateReviewInput,
	PaginatedResult
} from "$lib/types.js";

export class ReviewService {
	/**
	 * Create a new review
	 */
	async create(input: CreateReviewInput): Promise<Review> {
		const { productId, customerId, nickname, rating, comment } = input;

		if (!nickname || nickname.trim().length === 0) {
			throw new Error("Nickname is required");
		}

		if (rating < 1 || rating > 5) {
			throw new Error("Rating must be between 1 and 5");
		}

		// Check if customer already reviewed this product
		const existing = await this.getCustomerReviewForProduct(customerId, productId);
		if (existing) {
			throw new Error("You have already reviewed this product");
		}

		const isVerified = await this.checkVerifiedPurchase(productId, customerId);

		const [review] = await db
			.insert(reviews)
			.values({
				productId,
				customerId,
				nickname: nickname.trim(),
				rating,
				comment: comment ?? null,
				isVerifiedPurchase: isVerified,
				status: "pending"
			})
			.returning();

		return review;
	}

	/**
	 * Get a review by ID
	 */
	async getById(id: number): Promise<Review | null> {
		const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
		return review ?? null;
	}

	/**
	 * Get customer's review for a specific product
	 */
	async getCustomerReviewForProduct(
		customerId: number,
		productId: number
	): Promise<Review | null> {
		const [review] = await db
			.select()
			.from(reviews)
			.where(and(eq(reviews.customerId, customerId), eq(reviews.productId, productId)));
		return review ?? null;
	}

	/**
	 * Get approved reviews for a product
	 */
	async getProductReviews(
		productId: number,
		options: { limit?: number; offset?: number } = {}
	): Promise<PaginatedResult<ReviewWithCustomer>> {
		const { limit = 10, offset = 0 } = options;

		const [countResult] = await db
			.select({ count: count() })
			.from(reviews)
			.where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")));

		const total = countResult?.count ?? 0;

		const items = await db
			.select({
				review: reviews,
				customer: customers
			})
			.from(reviews)
			.innerJoin(customers, eq(reviews.customerId, customers.id))
			.where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
			.orderBy(desc(reviews.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((row) => ({
				...row.review,
				customer: row.customer
			})),
			pagination: {
				total,
				limit,
				offset,
				hasMore: offset + limit < total
			}
		};
	}

	/**
	 * Get all reviews for a customer
	 */
	async getCustomerReviews(customerId: number): Promise<Review[]> {
		return db
			.select()
			.from(reviews)
			.where(eq(reviews.customerId, customerId))
			.orderBy(desc(reviews.createdAt));
	}

	/**
	 * Get all reviews (for admin)
	 */
	async list(
		options: {
			status?: ReviewStatus;
			productId?: number;
			limit?: number;
			offset?: number;
			search?: string;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
		} = {}
	): Promise<PaginatedResult<ReviewWithRelations>> {
		const {
			status,
			productId,
			limit = 20,
			offset = 0,
			search,
			sortBy,
			sortOrder = "desc"
		} = options;

		const conditions = [];
		if (status) {
			conditions.push(eq(reviews.status, status));
		}
		if (productId) {
			conditions.push(eq(reviews.productId, productId));
		}
		if (search) {
			const pattern = `%${search}%`;
			conditions.push(
				sql`(${reviews.comment} LIKE ${pattern} OR ${reviews.nickname} LIKE ${pattern} OR ${products.name} LIKE ${pattern})`
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [countResult] = await db
			.select({ count: count() })
			.from(reviews)
			.innerJoin(customers, eq(reviews.customerId, customers.id))
			.innerJoin(products, eq(reviews.productId, products.id))
			.where(whereClause);
		const total = countResult?.count ?? 0;

		const sortColumnMap: Record<string, ReturnType<typeof sql>> = {
			comment: sql`${reviews.comment}`,
			product: sql`${products.name}`,
			nickname: sql`${reviews.nickname}`,
			status: sql`${reviews.status}`,
			createdAt: sql`${reviews.createdAt}`
		};
		const sortCol = (sortBy && sortColumnMap[sortBy]) || sql`${reviews.createdAt}`;
		const dirFn = sortOrder === "asc" ? asc : desc;

		const items = await db
			.select({
				review: reviews,
				customer: customers,
				product: products
			})
			.from(reviews)
			.innerJoin(customers, eq(reviews.customerId, customers.id))
			.innerJoin(products, eq(reviews.productId, products.id))
			.where(whereClause)
			.orderBy(dirFn(sortCol))
			.limit(limit)
			.offset(offset);

		return {
			items: items.map((row) => ({
				...row.review,
				customer: row.customer,
				product: row.product
			})),
			pagination: { total, limit, offset, hasMore: offset + limit < total }
		};
	}

	/**
	 * Get average rating and count for a product
	 */
	async getProductRating(productId: number): Promise<{ average: number; count: number }> {
		const [result] = await db
			.select({
				avg: sql<string>`COALESCE(AVG(${reviews.rating}), 0)`,
				count: count()
			})
			.from(reviews)
			.where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")));

		return {
			average: parseFloat(result?.avg ?? "0"),
			count: result?.count ?? 0
		};
	}

	/**
	 * Moderate a review (approve/reject)
	 */
	async moderate(id: number, status: "approved" | "rejected"): Promise<Review | null> {
		const [updated] = await db
			.update(reviews)
			.set({ status })
			.where(eq(reviews.id, id))
			.returning();

		return updated ?? null;
	}

	/**
	 * Delete a review
	 */
	async delete(id: number): Promise<boolean> {
		const result = await db.delete(reviews).where(eq(reviews.id, id));
		return true;
	}

	/**
	 * Check if customer has purchased the product (verified purchase)
	 */
	private async checkVerifiedPurchase(productId: number, customerId: number): Promise<boolean> {
		// Get variants for this product
		const variants = await db
			.select({ id: productVariants.id })
			.from(productVariants)
			.where(eq(productVariants.productId, productId));

		if (variants.length === 0) return false;

		const variantIds = variants.map((v) => v.id);

		// Check if customer has a completed order with any of these variants
		const [result] = await db
			.select({ count: count() })
			.from(orders)
			.innerJoin(orderLines, eq(orders.id, orderLines.orderId))
			.where(
				and(
					eq(orders.customerId, customerId),
					eq(orders.state, "delivered"),
					sql`${orderLines.variantId} IN ${variantIds}`
				)
			);

		return (result?.count ?? 0) > 0;
	}
}

export const reviewService = new ReviewService();
