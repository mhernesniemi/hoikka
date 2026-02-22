/**
 * Pure shipping calculation functions
 * No database or environment dependencies
 */

export interface OrderLineForWeight {
	quantity: number;
	weight?: number; // Weight in grams, optional
}

/**
 * Default weight per item when weight is not specified (in grams)
 */
export const DEFAULT_ITEM_WEIGHT = 500;

/**
 * Estimate total order weight from line items
 * Uses actual weight if available, falls back to default
 */
export function estimateOrderWeight(lines: OrderLineForWeight[]): number {
	return lines.reduce((total, line) => {
		const itemWeight = line.weight ?? DEFAULT_ITEM_WEIGHT;
		return total + line.quantity * itemWeight;
	}, 0);
}

/**
 * Generate a mock tracking number for a provider
 */
export function generateTrackingNumber(provider: string, orderId: number): string {
	const paddedId = orderId.toString().padStart(10, "0");
	const prefix = provider.toUpperCase().substring(0, 5);
	return `${prefix}${paddedId}`;
}

/**
 * Validate Finnish postal code
 */
export function isValidFinnishPostalCode(postalCode: string): boolean {
	// Finnish postal codes are 5 digits
	return /^\d{5}$/.test(postalCode);
}

/**
 * Calculate shipping price based on weight tiers
 */
export interface WeightTier {
	maxWeight: number; // Max weight in grams
	price: number; // Price in cents
}

export function calculateShippingByWeight(weight: number, tiers: WeightTier[]): number {
	// Sort tiers by maxWeight ascending
	const sortedTiers = [...tiers].sort((a, b) => a.maxWeight - b.maxWeight);

	for (const tier of sortedTiers) {
		if (weight <= tier.maxWeight) {
			return tier.price;
		}
	}

	// If weight exceeds all tiers, return the highest tier price
	return sortedTiers[sortedTiers.length - 1]?.price ?? 0;
}

/**
 * Check if destination is eligible for free shipping
 */
export function isEligibleForFreeShipping(
	orderTotal: number,
	freeShippingThreshold: number,
	countryCode: string,
	eligibleCountries: string[]
): boolean {
	const isEligibleCountry = eligibleCountries.includes(countryCode);
	const meetsThreshold = orderTotal >= freeShippingThreshold;
	return isEligibleCountry && meetsThreshold;
}
