/**
 * Related Products Service
 * Handles manual related product picks
 */
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { relatedProducts } from "../db/schema.js";
import { productService } from "./products.js";
import type { ProductWithRelations } from "@hoikka/core/shared/types";

export class RelatedProductService {
	/**
	 * Get related products for a product
	 */
	async getRelatedProducts(productId: number, limit = 8): Promise<ProductWithRelations[]> {
		const manual = await this.getManualRelations(productId);
		if (manual.length === 0) return [];

		const ids = manual.slice(0, limit).map((r) => r.relatedProductId);
		return productService.getByIds(ids);
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
