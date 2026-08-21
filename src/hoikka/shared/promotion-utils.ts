export type ActiveDiscount = {
	id: number;
	title: string | null;
	discountType: string;
	discountValue: number;
	promotionType: string;
	productIds: number[] | null;
};

/**
 * The single implementation of the discount formula: percentage rounds,
 * fixed amount is clamped to the base amount. Shared by storefront display
 * and server-side order math — drift here would desync the shown discount
 * from the charged one.
 */
export function calculateDiscount(
	discount: { discountType: string; discountValue: number },
	amount: number
): number {
	if (discount.discountType === "percentage") {
		return Math.round(amount * (discount.discountValue / 100));
	}
	return Math.min(discount.discountValue, amount);
}

/**
 * Find the best applicable discount for a product at a given price.
 * Returns the discount that saves the most money, or null if none apply.
 */
export function findBestDiscount(
	discounts: ActiveDiscount[],
	productId: number,
	price: number
): ActiveDiscount | null {
	if (discounts.length === 0 || price <= 0) return null;

	let best: ActiveDiscount | null = null;
	let bestAmount = 0;

	for (const d of discounts) {
		if (d.productIds !== null && !d.productIds.includes(productId)) continue;

		const amount = calculateDiscount(d, price);
		if (amount > bestAmount) {
			bestAmount = amount;
			best = d;
		}
	}

	return best;
}

/**
 * Calculate the discounted price after applying a discount.
 */
export function getDiscountedPrice(discount: ActiveDiscount, price: number): number {
	return Math.max(0, price - calculateDiscount(discount, price));
}
