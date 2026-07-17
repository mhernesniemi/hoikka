/**
 * Pure promotion calculation functions
 * No database or environment dependencies
 */

// The discount formula itself lives in the client-safe module so the
// storefront display and the order math can never drift apart.
export { calculateDiscount } from "$lib/promotion-utils.js";

export interface PromotionData {
	discountType: "percentage" | "fixed_amount";
	discountValue: number;
}

export interface PromotionCombineData {
	combinesWithOtherPromotions: boolean;
}

/**
 * Check if a new promotion can be combined with existing applied promotions.
 * Returns true if all existing promotions and the new one allow combining,
 * or if there are no existing promotions.
 */
export function canCombinePromotions(
	existingPromotions: PromotionCombineData[],
	newPromotion: PromotionCombineData
): boolean {
	if (existingPromotions.length === 0) return true;

	// The new promotion must allow combining
	if (!newPromotion.combinesWithOtherPromotions) return false;

	// All existing promotions must also allow combining
	return existingPromotions.every((p) => p.combinesWithOtherPromotions);
}
