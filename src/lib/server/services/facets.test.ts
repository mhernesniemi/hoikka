/**
 * Facet ordering against a real in-memory SQLite (full migration chain).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { productFacetValues, products } from "../db/schema.js";
import { facetService } from "./facets.js";

describe("facet ordering", () => {
	beforeEach(async () => {
		await db.run(sql`DELETE FROM facets`);
	});

	it("lists facets by position, then code", async () => {
		await facetService.create({ code: "size", name: "Size" });
		await facetService.create({ code: "brand", name: "Brand" });
		const color = await facetService.create({ code: "color", name: "Color" });
		await facetService.update(color.id, { position: -1 });

		const list = await facetService.list();
		expect(list.map((f) => f.code)).toEqual(["color", "brand", "size"]);
	});

	it("lists values by position, then code", async () => {
		const size = await facetService.create({ code: "size", name: "Size" });
		await facetService.createValue({ facetId: size.id, code: "l", name: "L", position: 2 });
		await facetService.createValue({ facetId: size.id, code: "s", name: "S", position: 0 });
		const m = await facetService.createValue({ facetId: size.id, code: "m", name: "M" });
		await facetService.updateValue(m.id, { position: 1 });

		const facet = await facetService.getById(size.id);
		expect(facet?.values.map((v) => v.code)).toEqual(["s", "m", "l"]);
	});

	it("finds the products carrying any value of a facet", async () => {
		const color = await facetService.create({ code: "color", name: "Color" });
		const red = await facetService.createValue({ facetId: color.id, code: "red", name: "Red" });
		const blue = await facetService.createValue({
			facetId: color.id,
			code: "blue",
			name: "Blue"
		});
		const [shirt] = await db.insert(products).values({ name: "Shirt" }).returning();
		await db.insert(productFacetValues).values([
			{ productId: shirt.id, facetValueId: red.id },
			{ productId: shirt.id, facetValueId: blue.id }
		]);

		expect(await facetService.getProductIds(color.id)).toEqual([shirt.id]);
	});
});
