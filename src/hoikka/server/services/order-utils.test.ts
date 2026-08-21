import { describe, it, expect } from "vitest";
import {
	isValidTransition,
	getAllowedTransitions,
	isTerminalState,
	isModifiableState,
	calculateOrderTotals,
	calculateCartItemCount,
	canAddToCart
} from "./order-utils";

describe("isValidTransition", () => {
	it("allows created -> payment_pending", () => {
		expect(isValidTransition("created", "payment_pending")).toBe(true);
	});

	it("allows created -> cancelled", () => {
		expect(isValidTransition("created", "cancelled")).toBe(true);
	});

	it("disallows created -> shipped", () => {
		expect(isValidTransition("created", "shipped")).toBe(false);
	});

	it("allows payment_pending -> paid", () => {
		expect(isValidTransition("payment_pending", "paid")).toBe(true);
	});

	it("allows paid -> shipped", () => {
		expect(isValidTransition("paid", "shipped")).toBe(true);
	});

	it("allows paid -> cancelled", () => {
		expect(isValidTransition("paid", "cancelled")).toBe(true);
	});

	it("allows shipped -> delivered", () => {
		expect(isValidTransition("shipped", "delivered")).toBe(true);
	});

	it("disallows shipped -> cancelled", () => {
		expect(isValidTransition("shipped", "cancelled")).toBe(false);
	});

	it("disallows any transition from delivered", () => {
		expect(isValidTransition("delivered", "cancelled")).toBe(false);
		expect(isValidTransition("delivered", "shipped")).toBe(false);
	});

	it("disallows any transition from cancelled", () => {
		expect(isValidTransition("cancelled", "created")).toBe(false);
		expect(isValidTransition("cancelled", "paid")).toBe(false);
	});
});

describe("getAllowedTransitions", () => {
	it("returns correct transitions for created", () => {
		expect(getAllowedTransitions("created")).toEqual(["payment_pending", "cancelled"]);
	});

	it("returns empty array for terminal states", () => {
		expect(getAllowedTransitions("delivered")).toEqual([]);
		expect(getAllowedTransitions("cancelled")).toEqual([]);
	});
});

describe("isTerminalState", () => {
	it("returns true for delivered", () => {
		expect(isTerminalState("delivered")).toBe(true);
	});

	it("returns true for cancelled", () => {
		expect(isTerminalState("cancelled")).toBe(true);
	});

	it("returns false for non-terminal states", () => {
		expect(isTerminalState("created")).toBe(false);
		expect(isTerminalState("paid")).toBe(false);
		expect(isTerminalState("shipped")).toBe(false);
	});
});

describe("isModifiableState", () => {
	it("returns true for created (cart)", () => {
		expect(isModifiableState("created")).toBe(true);
	});

	it("returns false for all other states", () => {
		expect(isModifiableState("payment_pending")).toBe(false);
		expect(isModifiableState("paid")).toBe(false);
		expect(isModifiableState("shipped")).toBe(false);
		expect(isModifiableState("delivered")).toBe(false);
		expect(isModifiableState("cancelled")).toBe(false);
	});
});

describe("calculateOrderTotals", () => {
	it("calculates totals for simple order", () => {
		const result = calculateOrderTotals({
			lines: [
				{ lineTotal: 1000, taxAmount: 194, lineTotalNet: 806 },
				{ lineTotal: 2000, taxAmount: 387, lineTotalNet: 1613 }
			],
			appliedPromotions: [],
			shipping: 500,
			isTaxExempt: false
		});

		expect(result.subtotal).toBe(3000);
		expect(result.taxTotal).toBe(581);
		expect(result.subtotalNet).toBe(2419);
		expect(result.discount).toBe(0);
		expect(result.shipping).toBe(500);
		expect(result.total).toBe(3500);
		expect(result.totalNet).toBe(2919);
	});

	it("applies order discount correctly", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 5000, taxAmount: 968, lineTotalNet: 4032 }],
			appliedPromotions: [{ discountAmount: 500, type: "order" }],
			shipping: 0,
			isTaxExempt: false
		});

		expect(result.subtotal).toBe(5000);
		expect(result.discount).toBe(500);
		expect(result.total).toBe(4500);
	});

	it("handles multiple promotions", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 10000, taxAmount: 1935, lineTotalNet: 8065 }],
			appliedPromotions: [
				{ discountAmount: 500, type: "order" },
				{ discountAmount: 300, type: "product" }
			],
			shipping: 0,
			isTaxExempt: false
		});

		expect(result.discount).toBe(800);
		expect(result.total).toBe(9200);
	});

	it("handles shipping discount separately", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 5000, taxAmount: 968, lineTotalNet: 4032 }],
			appliedPromotions: [{ discountAmount: 500, type: "shipping" }],
			shipping: 500,
			isTaxExempt: false
		});

		expect(result.subtotal).toBe(5000);
		expect(result.shipping).toBe(0); // 500 - 500 shipping discount
		expect(result.discount).toBe(500); // total discount includes shipping
		expect(result.total).toBe(5000); // subtotal + 0 shipping
	});

	it("handles mixed order and shipping discounts", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 10000, taxAmount: 1935, lineTotalNet: 8065 }],
			appliedPromotions: [
				{ discountAmount: 1000, type: "order" },
				{ discountAmount: 500, type: "shipping" }
			],
			shipping: 500,
			isTaxExempt: false
		});

		expect(result.subtotal).toBe(10000);
		expect(result.shipping).toBe(0); // free shipping
		expect(result.discount).toBe(1500); // 1000 order + 500 shipping
		expect(result.total).toBe(9000); // 10000 - 1000 + 0
	});

	it("caps shipping discount at shipping amount", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 5000, taxAmount: 968, lineTotalNet: 4032 }],
			appliedPromotions: [{ discountAmount: 1000, type: "shipping" }],
			shipping: 500,
			isTaxExempt: false
		});

		expect(result.shipping).toBe(0); // max(0, 500 - 1000)
		expect(result.total).toBe(5000);
	});

	it("handles tax-exempt orders", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 1240, taxAmount: 240, lineTotalNet: 1000 }],
			appliedPromotions: [],
			shipping: 500,
			isTaxExempt: true
		});

		expect(result.taxTotal).toBe(0);
		expect(result.total).toBe(1740);
		expect(result.totalNet).toBe(1740); // Same as total for tax-exempt
	});

	it("prevents negative totals", () => {
		const result = calculateOrderTotals({
			lines: [{ lineTotal: 500, taxAmount: 97, lineTotalNet: 403 }],
			appliedPromotions: [{ discountAmount: 1000, type: "order" }],
			shipping: 0,
			isTaxExempt: false
		});

		expect(result.total).toBe(0);
		expect(result.totalNet).toBe(0);
	});

	it("handles empty order", () => {
		const result = calculateOrderTotals({
			lines: [],
			appliedPromotions: [],
			shipping: 0,
			isTaxExempt: false
		});

		expect(result.subtotal).toBe(0);
		expect(result.total).toBe(0);
	});
});

describe("calculateCartItemCount", () => {
	it("sums quantities from all lines", () => {
		expect(calculateCartItemCount([{ quantity: 2 }, { quantity: 3 }, { quantity: 1 }])).toBe(6);
	});

	it("returns 0 for empty cart", () => {
		expect(calculateCartItemCount([])).toBe(0);
	});

	it("handles single item", () => {
		expect(calculateCartItemCount([{ quantity: 5 }])).toBe(5);
	});
});

describe("canAddToCart", () => {
	it("allows adding when stock is available", () => {
		const result = canAddToCart(2, 0, 10);
		expect(result.allowed).toBe(true);
		expect(result.maxAddable).toBe(10);
	});

	it("allows adding up to available stock", () => {
		const result = canAddToCart(5, 3, 8);
		expect(result.allowed).toBe(true);
		expect(result.maxAddable).toBe(5);
	});

	it("disallows adding when stock is insufficient", () => {
		const result = canAddToCart(5, 3, 5);
		expect(result.allowed).toBe(false);
		expect(result.maxAddable).toBe(2);
	});

	it("handles zero available stock", () => {
		const result = canAddToCart(1, 0, 0);
		expect(result.allowed).toBe(false);
		expect(result.maxAddable).toBe(0);
	});

	it("handles exact stock match", () => {
		const result = canAddToCart(3, 2, 5);
		expect(result.allowed).toBe(true);
		expect(result.maxAddable).toBe(3);
	});
});
