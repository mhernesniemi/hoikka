/**
 * Product page loader wiring tests against a real in-memory SQLite (full
 * migration chain). The composed services have their own coverage — this
 * checks the aggregate returns a coherent shape for found/missing products.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { productService } from "./products.js";
import { loadProductPageData } from "./product-page.js";

describe("loadProductPageData", () => {
	let productId: number;

	beforeAll(async () => {
		const product = await productService.create({ name: "Terra Pot", slug: "terra-pot" });
		productId = product.id;
	});

	it("returns the product with empty secondary data for a fresh product", async () => {
		const page = await loadProductPageData(productId, null);
		expect(page.product?.name).toBe("Terra Pot");
		expect(page.reviewsResult.items).toEqual([]);
		expect(page.breadcrumbs).toEqual([]);
		expect(page.relatedProducts).toEqual([]);
		expect(page.customerReview).toBeNull();
	});

	it("returns a null product for an unknown id", async () => {
		const page = await loadProductPageData(99999, null);
		expect(page.product).toBeNull();
	});
});
