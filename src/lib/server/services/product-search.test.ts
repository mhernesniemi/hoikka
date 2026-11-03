/**
 * Search and listing tests against a real in-memory SQLite (full migration chain).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	facetValues,
	facets,
	productFacetValues,
	products,
	productVariants
} from "../db/schema.js";
import { quickSearchProducts, listProducts, reindexProduct } from "./product-search.js";
import { bumpIndexVersion } from "./reindex.js";

async function insertFtsRow(rowid: number, name: string, description: string) {
	await db.run(sql`
		INSERT INTO product_search_fts
			(rowid, name, description, visibility, facets, variant_facet_images, min_price, in_stock)
		VALUES (${rowid}, ${name}, ${description}, 'public', '{}', '{}', 1000, 1)
	`);
	await bumpIndexVersion(db);
}

describe("search ranking", () => {
	beforeEach(async () => {
		await db.run(sql`DELETE FROM product_search_fts`);
		// Match only in description vs match in name — name must win despite
		// being inserted first (rowid order would otherwise decide).
		await insertFtsRow(1, "Terra Plant Pot", "Includes a drainage hole and saucer.");
		await insertFtsRow(2, "Drift Canvas Tote", "A roomy everyday bag.");
	});

	it("quick search ranks a name match above a description match", async () => {
		const results = await quickSearchProducts("dr");
		expect(results.map((r) => r.name)).toEqual(["Drift Canvas Tote", "Terra Plant Pot"]);
	});

	it("listing relevance sort ranks a name match above a description match", async () => {
		const { items } = await listProducts({ search: "dr" });
		expect(items.map((i) => i.name)).toEqual(["Drift Canvas Tote", "Terra Plant Pot"]);
	});
});

describe("facet index listing", () => {
	beforeEach(async () => {
		await db.run(sql`DELETE FROM product_search_fts`);
		await db.run(sql`DELETE FROM products`);
		await db.run(sql`DELETE FROM facets`);
		const [color, size] = await db
			.insert(facets)
			.values([{ code: "color" }, { code: "size" }])
			.returning();
		const values = await db
			.insert(facetValues)
			.values([
				{ facetId: color.id, code: "red", name: "Red" },
				{ facetId: color.id, code: "blue", name: "Blue" },
				{ facetId: size.id, code: "s", name: "S" },
				{ facetId: size.id, code: "m", name: "M" }
			])
			.returning();
		const id = (code: string) => values.find((v) => v.code === code)!.id;
		await db.insert(products).values([
			{ id: 1, name: "Shirt" },
			{ id: 2, name: "Hoodie" },
			{ id: 3, name: "Cap" }
		]);
		await db.insert(productVariants).values([
			{ id: 1, productId: 1, sku: "A", price: 3000 },
			{ id: 2, productId: 2, sku: "B", price: 1000 },
			{ id: 3, productId: 3, sku: "C", price: 2000 }
		]);
		await db.insert(productFacetValues).values([
			{ productId: 1, facetValueId: id("red") },
			{ productId: 1, facetValueId: id("s") },
			{ productId: 2, facetValueId: id("blue") },
			{ productId: 2, facetValueId: id("m") },
			{ productId: 3, facetValueId: id("red") },
			{ productId: 3, facetValueId: id("m") }
		]);
		for (const id of [1, 2, 3]) await reindexProduct(id);
	});

	const counts = (list: { valueCode: string; count: number }[] = []) =>
		Object.fromEntries(list.map((v) => [v.valueCode, v.count]));

	it("counts each filtered facet without its own filter", async () => {
		const { items, facetCounts, baseFacetCounts, pagination } = await listProducts({
			facets: { color: ["red"] }
		});
		expect(items.map((p) => p.id)).toEqual([3, 1]);
		expect(pagination.total).toBe(2);
		expect(counts(facetCounts.color)).toEqual({ red: 2, blue: 1 });
		expect(counts(facetCounts.size)).toEqual({ s: 1, m: 1 });
		expect(counts(baseFacetCounts.size)).toEqual({ s: 1, m: 2 });
	});

	it("filters by price and reports the range without the price filter", async () => {
		const { items, priceRange } = await listProducts({ priceMin: 1500 });
		expect(items.map((p) => p.id)).toEqual([3, 1]);
		expect(priceRange).toEqual({ min: 1000, max: 3000 });
	});

	it("sorts and pages within the results", async () => {
		const first = await listProducts({ sort: "price-asc", limit: 2 });
		expect(first.items.map((p) => p.id)).toEqual([2, 3]);
		expect(first.pagination.hasMore).toBe(true);
		const next = await listProducts({ sort: "price-asc", limit: 2, page: 2 });
		expect(next.items.map((p) => p.id)).toEqual([1]);
		expect((await listProducts({ limit: 0 })).items).toEqual([]);
	});

	it("sees a price change without a reindex", async () => {
		await db.update(productVariants).set({ price: 500 }).where(eq(productVariants.id, 1));
		const { items } = await listProducts({ priceMax: 600 });
		expect(items.map((p) => p.id)).toEqual([1]);
	});
});
