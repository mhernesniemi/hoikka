/**
 * Product page loader wiring tests against a real in-memory SQLite (full
 * migration chain). The composed services have their own coverage — this
 * checks the aggregate returns a coherent shape for found/missing products.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { db } from "../db/index.js";
import { products, productVariants } from "../db/schema.js";
import { productService } from "./products.js";
import { loadProductPageData } from "./product-page.js";
import { relatedProductService } from "./related-products.js";
import { reindexProduct } from "./product-search.js";

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

	it("lists public related products in their admin-set order", async () => {
		const related = await db
			.insert(products)
			.values([
				{ name: "Tall Pot", slug: "tall-pot" },
				{ name: "Draft Pot", slug: "draft-pot", visibility: "draft" },
				{ name: "Wide Pot", slug: "wide-pot" }
			])
			.returning();
		await db
			.insert(productVariants)
			.values(related.map((p) => ({ productId: p.id, sku: `POT-${p.id}`, price: 1000 })));
		for (const p of related) await reindexProduct(p.id);

		const [tall, draft, wide] = related;
		await relatedProductService.setManualRelations(productId, [wide.id, draft.id, tall.id]);

		const page = await loadProductPageData(productId, null);
		expect(page.relatedProducts.map((p) => p.name)).toEqual(["Wide Pot", "Tall Pot"]);
		expect(page.relatedProducts[0].minPrice).toBe(1000);
	});

	it("returns a null product for an unknown id", async () => {
		const page = await loadProductPageData(99999, null);
		expect(page.product).toBeNull();
	});
});
