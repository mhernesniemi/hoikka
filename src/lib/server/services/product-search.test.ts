/**
 * Search ranking tests against a real in-memory SQLite (full migration chain).
 * FTS rows are inserted directly — this tests ranking, not reindexing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { quickSearchProducts, listProducts } from "./product-search.js";

async function insertFtsRow(rowid: number, name: string, description: string) {
	await db.run(sql`
		INSERT INTO product_search_fts
			(rowid, name, description, visibility, facets, variant_facet_images, min_price, in_stock)
		VALUES (${rowid}, ${name}, ${description}, 'public', '{}', '{}', 1000, 1)
	`);
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
