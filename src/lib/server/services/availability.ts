/**
 * Availability Service
 * The volatile half of a product page: how much is left right now.
 *
 * Names, descriptions, prices and images change when an editor saves; stock
 * changes with every paid or cancelled order. Storefront pages are edge-cached
 * per catalog version (see $lib/server/edge-cache.ts), so folding purchases
 * into that version would orphan every cached page on every sale — worst
 * exactly during a burst, where each purchase forces cold renders for everyone
 * else. Availability is read through this small query instead: cached HTML
 * carries the snapshot taken when it rendered, the storefront corrects it
 * client-side, and checkout re-validates authoritatively. A display that is a
 * few seconds stale therefore cannot oversell.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { productVariants } from "../db/schema.js";

export interface ProductAvailability {
	/** Per variant: addable to the cart right now. A flag, not a count — the
	 *  storefront only renders in/out of stock, and inventory levels are not
	 *  the public's business. */
	variants: { id: number; inStock: boolean }[];
}

/** Live stock for one product. One indexed read, no joins. */
export async function getProductAvailability(productId: number): Promise<ProductAvailability> {
	const variants = await db
		.select({
			id: productVariants.id,
			stock: productVariants.stock,
			trackInventory: productVariants.trackInventory
		})
		.from(productVariants)
		.where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));

	return {
		variants: variants.map((v) => ({ id: v.id, inStock: !v.trackInventory || v.stock > 0 }))
	};
}
