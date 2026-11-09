/**
 * Related Products Service
 * Handles manual related product picks
 */
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { relatedProducts } from "../db/schema.js";
import { listProducts } from "./product-search.js";
import type { CachedProduct } from "#lib/types.js";

export class RelatedProductService {
	/**
	 * Related products in their admin-set order, as listing rows (public only,
	 * with the customer's group prices)
	 */
	async getRelatedProducts(
		productId: number,
		limit = 8,
		customerId: number | null = null
	): Promise<CachedProduct[]> {
		const ids = (await this.getManualRelations(productId))
			.slice(0, limit)
			.map((r) => r.relatedProductId);
		if (ids.length === 0) return [];

		const { items } = await listProducts({ productIds: ids, limit: ids.length, customerId });
		const byId = new Map(items.map((item) => [item.id, item]));
		return ids.flatMap((id) => byId.get(id) ?? []);
	}

	/**
	 * Get manual relations ordered by position
	 */
	async getManualRelations(productId: number) {
		return db
			.select()
			.from(relatedProducts)
			.where(eq(relatedProducts.productId, productId))
			.orderBy(asc(relatedProducts.position));
	}

	/**
	 * Replace all manual relations for a product
	 */
	async setManualRelations(productId: number, relatedProductIds: number[]): Promise<void> {
		await db.delete(relatedProducts).where(eq(relatedProducts.productId, productId));

		if (relatedProductIds.length === 0) return;

		await db.insert(relatedProducts).values(
			relatedProductIds.map((relatedProductId, index) => ({
				productId,
				relatedProductId,
				position: index
			}))
		);
	}
}

export const relatedProductService = new RelatedProductService();
