import { describe, it, expect } from "vitest";
import { withQuantity, withAddedLine } from "./cart-optimistic";
import type { CartView } from "@hoikka/core/server/services/cart";

const line = (variantId: number, quantity: number, unitPrice = 1000) => ({
	variantId,
	productId: 1,
	productName: "P",
	variantName: null,
	sku: "",
	imageUrl: null,
	unitPrice,
	quantity,
	lineTotal: unitPrice * quantity,
	taxAmount: 0,
	taxCode: "standard",
	taxRate: 0,
	unitPriceNet: unitPrice,
	lineTotalNet: unitPrice * quantity,
	available: null,
	outOfStock: false
});

const cart = (...lines: ReturnType<typeof line>[]): CartView => ({
	lines,
	itemCount: lines.reduce((s, l) => s + l.quantity, 0),
	subtotal: 123,
	discount: 0,
	taxTotal: 0,
	total: 123,
	isTaxExempt: false,
	promotions: []
});

describe("withQuantity", () => {
	it("updates quantity, line total and item count", () => {
		const next = withQuantity(cart(line(1, 1), line(2, 3)), 1, 4);
		expect(next.lines[0]).toMatchObject({ quantity: 4, lineTotal: 4000 });
		expect(next.itemCount).toBe(7);
	});

	it("removes the line at quantity zero", () => {
		const next = withQuantity(cart(line(1, 2), line(2, 1)), 1, 0);
		expect(next.lines.map((l) => l.variantId)).toEqual([2]);
		expect(next.itemCount).toBe(1);
	});

	it("leaves cart-level money untouched (server-authoritative)", () => {
		expect(withQuantity(cart(line(1, 1)), 1, 5).subtotal).toBe(123);
	});
});

describe("withAddedLine", () => {
	const seed = {
		variantId: 9,
		productId: 3,
		productName: "Grape",
		variantName: "Green",
		imageUrl: "/uploads/products/g.png",
		unitPrice: 2000
	};

	it("appends a synthetic line for a new variant", () => {
		const next = withAddedLine(cart(line(1, 1)), seed, 2);
		expect(next.lines).toHaveLength(2);
		expect(next.lines[1]).toMatchObject({
			variantId: 9,
			productName: "Grape",
			quantity: 2,
			lineTotal: 4000,
			outOfStock: false
		});
		expect(next.itemCount).toBe(3);
	});

	it("merges into an existing line for the same variant", () => {
		const next = withAddedLine(cart(line(9, 1, 2000)), seed, 2);
		expect(next.lines).toHaveLength(1);
		expect(next.lines[0]).toMatchObject({ quantity: 3, lineTotal: 6000 });
		expect(next.itemCount).toBe(3);
	});
});
