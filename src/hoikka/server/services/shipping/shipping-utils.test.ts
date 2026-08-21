import { describe, it, expect } from "vitest";
import {
	estimateOrderWeight,
	generateTrackingNumber,
	isValidFinnishPostalCode,
	calculateShippingByWeight,
	isEligibleForFreeShipping,
	DEFAULT_ITEM_WEIGHT
} from "./shipping-utils";

describe("estimateOrderWeight", () => {
	it("calculates weight using actual weights", () => {
		const lines = [
			{ quantity: 2, weight: 300 },
			{ quantity: 1, weight: 1000 }
		];
		expect(estimateOrderWeight(lines)).toBe(1600); // (2*300) + (1*1000)
	});

	it("falls back to default weight when not specified", () => {
		const lines = [{ quantity: 3 }];
		expect(estimateOrderWeight(lines)).toBe(3 * DEFAULT_ITEM_WEIGHT);
	});

	it("mixes actual and default weights", () => {
		const lines = [
			{ quantity: 1, weight: 200 },
			{ quantity: 2 } // Uses default
		];
		expect(estimateOrderWeight(lines)).toBe(200 + 2 * DEFAULT_ITEM_WEIGHT);
	});

	it("returns 0 for empty order", () => {
		expect(estimateOrderWeight([])).toBe(0);
	});
});

describe("generateTrackingNumber", () => {
	it("generates tracking number with provider prefix", () => {
		expect(generateTrackingNumber("posti", 123)).toBe("POSTI0000000123");
	});

	it("truncates long provider names", () => {
		expect(generateTrackingNumber("matkahuolto", 1)).toBe("MATKA0000000001");
	});

	it("pads order ID to 10 digits", () => {
		expect(generateTrackingNumber("test", 1)).toBe("TEST0000000001");
	});
});

describe("isValidFinnishPostalCode", () => {
	it("accepts valid 5-digit postal codes", () => {
		expect(isValidFinnishPostalCode("00100")).toBe(true);
		expect(isValidFinnishPostalCode("33100")).toBe(true);
		expect(isValidFinnishPostalCode("99999")).toBe(true);
	});

	it("rejects postal codes with wrong length", () => {
		expect(isValidFinnishPostalCode("0010")).toBe(false);
		expect(isValidFinnishPostalCode("001000")).toBe(false);
	});

	it("rejects postal codes with letters", () => {
		expect(isValidFinnishPostalCode("0010A")).toBe(false);
		expect(isValidFinnishPostalCode("ABCDE")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isValidFinnishPostalCode("")).toBe(false);
	});
});

describe("calculateShippingByWeight", () => {
	const tiers = [
		{ maxWeight: 1000, price: 590 },
		{ maxWeight: 2000, price: 790 },
		{ maxWeight: 5000, price: 990 },
		{ maxWeight: 10000, price: 1490 }
	];

	it("returns correct price for first tier", () => {
		expect(calculateShippingByWeight(500, tiers)).toBe(590);
		expect(calculateShippingByWeight(1000, tiers)).toBe(590);
	});

	it("returns correct price for middle tier", () => {
		expect(calculateShippingByWeight(1500, tiers)).toBe(790);
		expect(calculateShippingByWeight(3000, tiers)).toBe(990);
	});

	it("returns highest tier price when weight exceeds all tiers", () => {
		expect(calculateShippingByWeight(15000, tiers)).toBe(1490);
	});

	it("handles unsorted tiers", () => {
		const unsorted = [
			{ maxWeight: 5000, price: 990 },
			{ maxWeight: 1000, price: 590 },
			{ maxWeight: 2000, price: 790 }
		];
		expect(calculateShippingByWeight(1500, unsorted)).toBe(790);
	});

	it("returns 0 for empty tiers", () => {
		expect(calculateShippingByWeight(1000, [])).toBe(0);
	});
});

describe("isEligibleForFreeShipping", () => {
	const eligibleCountries = ["FI", "SE", "NO"];
	const threshold = 5000; // 50 EUR

	it("returns true when threshold met and country eligible", () => {
		expect(isEligibleForFreeShipping(5000, threshold, "FI", eligibleCountries)).toBe(true);
		expect(isEligibleForFreeShipping(10000, threshold, "SE", eligibleCountries)).toBe(true);
	});

	it("returns false when threshold not met", () => {
		expect(isEligibleForFreeShipping(4999, threshold, "FI", eligibleCountries)).toBe(false);
	});

	it("returns false when country not eligible", () => {
		expect(isEligibleForFreeShipping(10000, threshold, "US", eligibleCountries)).toBe(false);
		expect(isEligibleForFreeShipping(10000, threshold, "DE", eligibleCountries)).toBe(false);
	});

	it("returns false when neither condition met", () => {
		expect(isEligibleForFreeShipping(1000, threshold, "US", eligibleCountries)).toBe(false);
	});
});
