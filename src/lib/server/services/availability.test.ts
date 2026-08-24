/**
 * Availability tests against a real migrated in-memory SQLite. This query is
 * what keeps purchases out of the edge-cache version (see availability.ts):
 * it must report what the storefront needs — addable or not — without leaking
 * inventory levels or resurrecting deleted variants.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import { products, productVariants } from "../db/schema.js";
import { getProductAvailability } from "./availability.js";

let counter = 0;

async function makeProduct() {
	const [product] = await db
		.insert(products)
		.values({ name: `Product ${++counter}`, slug: `product-${counter}` })
		.returning();
	return product;
}

describe("getProductAvailability", () => {
	it("reports addability per variant without exposing stock levels", async () => {
		const product = await makeProduct();
		const inserted = await db
			.insert(productVariants)
			.values([
				{ productId: product.id, sku: `A-${counter}`, price: 1000, stock: 3 },
				{ productId: product.id, sku: `B-${counter}`, price: 1000, stock: 0 },
				{
					productId: product.id,
					sku: `C-${counter}`,
					price: 1000,
					stock: 0,
					trackInventory: false
				}
			])
			.returning();

		const { variants } = await getProductAvailability(product.id);
		const byId = new Map(variants.map((v) => [v.id, v]));

		expect(byId.get(inserted[0].id)?.inStock).toBe(true);
		expect(byId.get(inserted[1].id)?.inStock).toBe(false);
		// Untracked variants never run out
		expect(byId.get(inserted[2].id)?.inStock).toBe(true);
		expect(Object.keys(variants[0])).toEqual(["id", "inStock"]);
	});

	it("omits soft-deleted variants", async () => {
		const product = await makeProduct();
		const [deleted] = await db
			.insert(productVariants)
			.values({
				productId: product.id,
				sku: `D-${counter}`,
				price: 1000,
				stock: 5,
				deletedAt: new Date()
			})
			.returning();

		const { variants } = await getProductAvailability(product.id);
		expect(variants.find((v) => v.id === deleted.id)).toBeUndefined();
	});
});
