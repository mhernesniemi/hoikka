/**
 * Guest edge-cache gate tests. The gate decides which requests may be
 * answered from the SHARED cache — a false positive here serves one
 * visitor's data to another (this happened: remote-function requests
 * report the issuing page as event.url, and gating on that once cached
 * per-user getCart responses globally).
 */
import { describe, it, expect } from "vitest";
import { isCacheableRequest, invalidatesCatalog } from "./edge-cache.js";

const B = "https://shop.example";
const cacheable = (path: string, cookie: string | null = null) =>
	isCacheableRequest(new URL(B + path), cookie);

describe("isCacheableRequest", () => {
	it("allows guest storefront pages and their data requests", () => {
		expect(cacheable("/")).toBe(true);
		expect(cacheable("/__data.json?x-sveltekit-invalidated=01")).toBe(true);
		expect(cacheable("/products")).toBe(true);
		expect(cacheable("/products/9/grape")).toBe(true);
		expect(cacheable("/products/9/grape/__data.json?x-sveltekit-invalidated=001")).toBe(true);
		expect(cacheable("/category/fruits")).toBe(true);
		expect(cacheable("/sitemap.xml")).toBe(true);
	});

	it("never caches remote function endpoints (per-user responses)", () => {
		expect(cacheable("/_app/remote/1hv6wng/getCart")).toBe(false);
		expect(cacheable("/_app/remote/1hv6wng/getCheckout")).toBe(false);
		expect(cacheable("/_app/remote/abc/isProductWishlisted?payload=%5B9%5D")).toBe(false);
	});

	it("never caches personal or transactional routes", () => {
		for (const p of [
			"/checkout",
			"/wishlist",
			"/account",
			"/admin",
			"/api/assets/upload",
			"/sign-in"
		]) {
			expect(cacheable(p), p).toBe(false);
		}
	});

	it("bypasses preview requests and authenticated visitors", () => {
		expect(cacheable("/products/9/grape?preview=1")).toBe(false);
		expect(cacheable("/products/9/grape", "better-auth.session_token=abc")).toBe(false);
		expect(cacheable("/products/9/grape", "cart=%5B1%2C%5B13%2C1%5D%5D")).toBe(true);
	});
});

describe("invalidatesCatalog", () => {
	it("orphans the cache when an editor changes content", () => {
		for (const p of [
			"/admin/products/9",
			"/admin/categories",
			"/admin/pages/about",
			"/api/assets/upload"
		]) {
			expect(invalidatesCatalog(p), p).toBe(true);
		}
	});

	// A sale must not cold-render the storefront for everyone else: stock is
	// read out of band and re-checked at checkout.
	it("leaves the cache alone for order administration and storefront writes", () => {
		for (const p of [
			"/admin/orders",
			"/admin/orders/42",
			"/checkout",
			"/api/webhooks/stripe"
		]) {
			expect(invalidatesCatalog(p), p).toBe(false);
		}
	});
});
