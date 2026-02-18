import { describe, it, expect } from "vitest";
import { findBestDiscount, getDiscountedPrice, type ActiveDiscount } from "./promotion-utils";

function createDiscount(overrides: Partial<ActiveDiscount> = {}): ActiveDiscount {
	return {
		id: 1,
		title: "Test",
		discountType: "percentage",
		discountValue: 10,
		promotionType: "automatic",
		productIds: null,
		...overrides
	};
}

describe("findBestDiscount", () => {
	it("returns null for empty discounts", () => {
		expect(findBestDiscount([], 1, 1000)).toBeNull();
	});

	it("returns null when price is 0", () => {
		expect(findBestDiscount([createDiscount()], 1, 0)).toBeNull();
	});

	it("returns null when price is negative", () => {
		expect(findBestDiscount([createDiscount()], 1, -100)).toBeNull();
	});

	it("filters by productIds", () => {
		const d = createDiscount({ productIds: [5, 10] });
		expect(findBestDiscount([d], 1, 1000)).toBeNull();
		expect(findBestDiscount([d], 5, 1000)).toBe(d);
	});

	it("applies to all products when productIds is null", () => {
		const d = createDiscount({ productIds: null });
		expect(findBestDiscount([d], 999, 1000)).toBe(d);
	});

	it("selects the discount with highest savings", () => {
		const small = createDiscount({ id: 1, discountType: "percentage", discountValue: 5 });
		const large = createDiscount({ id: 2, discountType: "percentage", discountValue: 20 });
		expect(findBestDiscount([small, large], 1, 1000)).toBe(large);
	});

	it("compares percentage vs fixed correctly", () => {
		// 10% of 1000 = 100, fixed 200 wins
		const pct = createDiscount({ id: 1, discountType: "percentage", discountValue: 10 });
		const fixed = createDiscount({ id: 2, discountType: "fixed_amount", discountValue: 200 });
		expect(findBestDiscount([pct, fixed], 1, 1000)).toBe(fixed);
	});

	it("caps fixed discount at price", () => {
		const fixed = createDiscount({ discountType: "fixed_amount", discountValue: 5000 });
		// savings capped at 1000 (the price)
		expect(findBestDiscount([fixed], 1, 1000)).toBe(fixed);
	});
});

describe("getDiscountedPrice", () => {
	it("applies percentage discount", () => {
		const d = createDiscount({ discountType: "percentage", discountValue: 25 });
		expect(getDiscountedPrice(d, 1000)).toBe(750);
	});

	it("applies fixed discount", () => {
		const d = createDiscount({ discountType: "fixed_amount", discountValue: 300 });
		expect(getDiscountedPrice(d, 1000)).toBe(700);
	});

	it("floors at 0 for fixed discount exceeding price", () => {
		const d = createDiscount({ discountType: "fixed_amount", discountValue: 2000 });
		expect(getDiscountedPrice(d, 1000)).toBe(0);
	});

	it("rounds percentage discount to nearest cent", () => {
		const d = createDiscount({ discountType: "percentage", discountValue: 10 });
		// 10% of 999 = 99.9, rounds to 100 → 999 - 100 = 899
		expect(getDiscountedPrice(d, 999)).toBe(899);
	});
});
