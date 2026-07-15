import { describe, it, expect } from "vitest";
import {
	parseCartCookie,
	serializeCartCookie,
	addLine,
	setQuantity,
	removeLine,
	countItems,
	type CartLine
} from "./cart-cookie.js";

describe("parseCartCookie", () => {
	it("returns empty array for missing cookie", () => {
		expect(parseCartCookie(undefined)).toEqual([]);
		expect(parseCartCookie(null)).toEqual([]);
		expect(parseCartCookie("")).toEqual([]);
	});

	it("returns empty array for malformed JSON", () => {
		expect(parseCartCookie("not json")).toEqual([]);
		expect(parseCartCookie("{}")).toEqual([]);
		expect(parseCartCookie("[")).toEqual([]);
	});

	it("returns empty array for unknown version", () => {
		expect(parseCartCookie("[2,[1,1]]")).toEqual([]);
		expect(parseCartCookie("[[1,1]]")).toEqual([]);
	});

	it("parses a valid cookie", () => {
		expect(parseCartCookie("[1,[12,2],[34,1]]")).toEqual([
			{ variantId: 12, quantity: 2 },
			{ variantId: 34, quantity: 1 }
		]);
	});

	it("skips invalid entries", () => {
		expect(parseCartCookie('[1,[12,2],"junk",[0,1],[3,-1],[4,1.5],[5,3]]')).toEqual([
			{ variantId: 12, quantity: 2 },
			{ variantId: 5, quantity: 3 }
		]);
	});

	it("dedupes repeated variant ids, first wins", () => {
		expect(parseCartCookie("[1,[7,1],[7,5]]")).toEqual([{ variantId: 7, quantity: 1 }]);
	});

	it("caps quantity and line count", () => {
		expect(parseCartCookie("[1,[7,5000]]")).toEqual([{ variantId: 7, quantity: 999 }]);
		const big = JSON.stringify([1, ...Array.from({ length: 60 }, (_, i) => [i + 1, 1])]);
		expect(parseCartCookie(big)).toHaveLength(50);
	});
});

describe("serializeCartCookie", () => {
	it("round-trips through parse", () => {
		const lines: CartLine[] = [
			{ variantId: 12, quantity: 2 },
			{ variantId: 34, quantity: 1 }
		];
		expect(parseCartCookie(serializeCartCookie(lines))).toEqual(lines);
	});

	it("serializes an empty cart", () => {
		expect(serializeCartCookie([])).toBe("[1]");
	});

	it("stays compact for a full cart", () => {
		const lines = Array.from({ length: 50 }, (_, i) => ({
			variantId: 100000 + i,
			quantity: 999
		}));
		expect(serializeCartCookie(lines).length).toBeLessThan(1024);
	});
});

describe("addLine", () => {
	it("adds a new line", () => {
		expect(addLine([], 5, 2)).toEqual([{ variantId: 5, quantity: 2 }]);
	});

	it("merges quantity into an existing line", () => {
		expect(addLine([{ variantId: 5, quantity: 2 }], 5, 3)).toEqual([
			{ variantId: 5, quantity: 5 }
		]);
	});

	it("ignores non-positive quantities", () => {
		const lines = [{ variantId: 5, quantity: 2 }];
		expect(addLine(lines, 6, 0)).toEqual(lines);
		expect(addLine(lines, 6, -1)).toEqual(lines);
	});

	it("throws when the cart is full", () => {
		const full = Array.from({ length: 50 }, (_, i) => ({ variantId: i + 1, quantity: 1 }));
		expect(() => addLine(full, 999, 1)).toThrow(/limited/);
	});

	it("does not mutate the input", () => {
		const lines = [{ variantId: 5, quantity: 2 }];
		addLine(lines, 5, 1);
		expect(lines).toEqual([{ variantId: 5, quantity: 2 }]);
	});
});

describe("setQuantity", () => {
	it("updates quantity", () => {
		expect(setQuantity([{ variantId: 5, quantity: 2 }], 5, 7)).toEqual([
			{ variantId: 5, quantity: 7 }
		]);
	});

	it("removes the line when quantity drops to zero", () => {
		expect(setQuantity([{ variantId: 5, quantity: 2 }], 5, 0)).toEqual([]);
	});
});

describe("removeLine", () => {
	it("removes only the matching line", () => {
		expect(
			removeLine(
				[
					{ variantId: 5, quantity: 2 },
					{ variantId: 6, quantity: 1 }
				],
				5
			)
		).toEqual([{ variantId: 6, quantity: 1 }]);
	});
});

describe("countItems", () => {
	it("sums quantities", () => {
		expect(countItems([])).toBe(0);
		expect(
			countItems([
				{ variantId: 5, quantity: 2 },
				{ variantId: 6, quantity: 3 }
			])
		).toBe(5);
	});
});
