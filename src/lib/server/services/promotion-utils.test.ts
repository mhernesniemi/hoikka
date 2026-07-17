import { describe, it, expect } from "vitest";
import { calculateDiscount, canCombinePromotions } from "./promotion-utils";

describe("calculateDiscount", () => {
	it("calculates percentage discount", () => {
		expect(calculateDiscount({ discountType: "percentage", discountValue: 20 }, 10000)).toBe(
			2000
		);
	});

	it("calculates fixed amount discount", () => {
		expect(calculateDiscount({ discountType: "fixed_amount", discountValue: 500 }, 10000)).toBe(
			500
		);
	});

	it("caps fixed amount at order amount", () => {
		expect(calculateDiscount({ discountType: "fixed_amount", discountValue: 5000 }, 3000)).toBe(
			3000
		);
	});

	it("handles zero order amount", () => {
		expect(calculateDiscount({ discountType: "percentage", discountValue: 20 }, 0)).toBe(0);
	});

	it("rounds percentage discount", () => {
		expect(calculateDiscount({ discountType: "percentage", discountValue: 15 }, 999)).toBe(150);
	});
});

describe("canCombinePromotions", () => {
	it("allows first promotion regardless of combine setting", () => {
		expect(canCombinePromotions([], { combinesWithOtherPromotions: false })).toBe(true);
	});

	it("allows combining when all promotions allow it", () => {
		expect(
			canCombinePromotions([{ combinesWithOtherPromotions: true }], {
				combinesWithOtherPromotions: true
			})
		).toBe(true);
	});

	it("blocks when new promotion does not allow combining", () => {
		expect(
			canCombinePromotions([{ combinesWithOtherPromotions: true }], {
				combinesWithOtherPromotions: false
			})
		).toBe(false);
	});

	it("blocks when existing promotion does not allow combining", () => {
		expect(
			canCombinePromotions([{ combinesWithOtherPromotions: false }], {
				combinesWithOtherPromotions: true
			})
		).toBe(false);
	});

	it("blocks when neither allows combining", () => {
		expect(
			canCombinePromotions([{ combinesWithOtherPromotions: false }], {
				combinesWithOtherPromotions: false
			})
		).toBe(false);
	});

	it("checks all existing promotions", () => {
		expect(
			canCombinePromotions(
				[{ combinesWithOtherPromotions: true }, { combinesWithOtherPromotions: false }],
				{ combinesWithOtherPromotions: true }
			)
		).toBe(false);
	});
});
