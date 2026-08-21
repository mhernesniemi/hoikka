import { describe, it, expect } from "vitest";
import { parseWishlistCookie, serializeWishlistCookie, toggleId } from "./wishlist-cookie.js";

describe("parseWishlistCookie", () => {
	it("returns empty array for missing or malformed cookie", () => {
		expect(parseWishlistCookie(undefined)).toEqual([]);
		expect(parseWishlistCookie(null)).toEqual([]);
		expect(parseWishlistCookie("")).toEqual([]);
		expect(parseWishlistCookie("not json")).toEqual([]);
		expect(parseWishlistCookie("{}")).toEqual([]);
	});

	it("returns empty array for unknown version", () => {
		expect(parseWishlistCookie("[2,5]")).toEqual([]);
		expect(parseWishlistCookie("[5]")).toEqual([]);
	});

	it("parses a valid cookie", () => {
		expect(parseWishlistCookie("[1,5,12,7]")).toEqual([5, 12, 7]);
	});

	it("skips invalid entries and dedupes", () => {
		expect(parseWishlistCookie('[1,5,"x",0,-3,1.5,5,9]')).toEqual([5, 9]);
	});

	it("caps the number of items", () => {
		const big = JSON.stringify([1, ...Array.from({ length: 150 }, (_, i) => i + 1)]);
		expect(parseWishlistCookie(big)).toHaveLength(100);
	});
});

describe("serializeWishlistCookie", () => {
	it("round-trips through parse", () => {
		expect(parseWishlistCookie(serializeWishlistCookie([5, 12]))).toEqual([5, 12]);
		expect(serializeWishlistCookie([])).toBe("[1]");
	});
});

describe("toggleId", () => {
	it("adds a missing id", () => {
		expect(toggleId([5], 9)).toEqual({ ids: [5, 9], added: true });
	});

	it("removes an existing id", () => {
		expect(toggleId([5, 9], 5)).toEqual({ ids: [9], added: false });
	});

	it("does not mutate the input", () => {
		const ids = [5];
		toggleId(ids, 9);
		expect(ids).toEqual([5]);
	});

	it("evicts the oldest entry when full", () => {
		const full = Array.from({ length: 100 }, (_, i) => i + 1);
		const { ids, added } = toggleId(full, 999);
		expect(added).toBe(true);
		expect(ids).toHaveLength(100);
		expect(ids[0]).toBe(2); // oldest (1) evicted
		expect(ids.at(-1)).toBe(999);
	});
});
