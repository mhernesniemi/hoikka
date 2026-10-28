/**
 * upsertProductsBySku against a real in-memory SQLite (full migration chain),
 * so the search index and its stock triggers are what the storefront reads.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
vi.mock("$hoikka/config", async (importOriginal) => {
	const { default: config } = await importOriginal<typeof import("$hoikka/config")>();
	return {
		default: {
			...config,
			productTypes: {
				...config.productTypes,
				part: {
					label: "Part",
					fields: [
						{ key: "grade", label: "Grade", type: "text", readOnly: true },
						{ key: "weightKg", label: "Weight", type: "number", readOnly: true },
						{ key: "notes", label: "Notes", type: "text" }
					]
				}
			}
		}
	};
});

import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { products, productVariants } from "../db/schema.js";
import { productService } from "./products.js";
import { upsertProductsBySku, type ExternalProductRow } from "./external-products.js";

const part = (sku: string, overrides: Partial<ExternalProductRow> = {}): ExternalProductRow => ({
	sku,
	name: `Part ${sku}`,
	active: true,
	stock: 5,
	customFields: { grade: "A" },
	...overrides
});

const upsert = (rows: ExternalProductRow[], hideMissing = false) =>
	upsertProductsBySku(rows, { productType: "part", hideMissing });

async function bySku(sku: string) {
	const [row] = await db
		.select({ product: products, variant: productVariants })
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.where(eq(productVariants.sku, sku));
	return row;
}

async function indexed(productId: number) {
	const [row] = await db.all<{ name: string; visibility: string; in_stock: number }>(
		sql`select name, visibility, in_stock from product_search_fts where rowid = ${productId}`
	);
	return row;
}

describe("upsertProductsBySku", () => {
	beforeEach(async () => {
		await db.delete(products);
		await db.run(sql`delete from product_search_fts`);
	});

	it("creates a product with one variant per SKU and indexes it", async () => {
		const summary = await upsert([part("P-1"), part("P-2", { active: false, price: 1250 })]);

		expect(summary).toEqual({ total: 2, created: 2, updated: 0, hidden: 0 });
		const { product, variant } = await bySku("P-1");
		expect(product).toMatchObject({
			name: "Part P-1",
			type: "part",
			visibility: "public",
			customFields: { grade: "A" }
		});
		expect(variant).toMatchObject({ stock: 5, price: 0 });
		expect((await bySku("P-2")).product.visibility).toBe("draft");
		expect((await bySku("P-2")).variant.price).toBe(1250);
		expect(await indexed(product.id)).toMatchObject({ name: "Part P-1", in_stock: 1 });
	});

	it("leaves unchanged products alone", async () => {
		await upsert([part("P-1")]);
		await db.run(sql`delete from product_search_fts`);

		expect(await upsert([part("P-1")])).toMatchObject({ created: 0, updated: 0 });
		// Not reindexed: the row deleted above stays gone
		expect(await indexed((await bySku("P-1")).product.id)).toBeUndefined();
	});

	it("updates stock without a reindex, and names through one", async () => {
		await upsert([part("P-1"), part("P-2")]);
		const p1 = (await bySku("P-1")).product.id;
		// A marker a reindex would overwrite
		await db.run(sql`update product_search_fts set name = 'marker' where rowid = ${p1}`);

		const summary = await upsert([part("P-1", { stock: 0 }), part("P-2", { name: "Renamed" })]);

		expect(summary).toMatchObject({ created: 0, updated: 2 });
		expect((await bySku("P-1")).variant.stock).toBe(0);
		expect(await indexed(p1)).toMatchObject({ name: "marker", in_stock: 0 });
		expect(await indexed((await bySku("P-2")).product.id)).toMatchObject({ name: "Renamed" });
	});

	it("writes readOnly fields over the stored ones and keeps the admin's", async () => {
		await upsert([part("P-1")]);
		const { product } = await bySku("P-1");
		await productService.update(product.id, { customFields: { notes: "Admin note" } });

		await upsert([part("P-1", { customFields: { grade: "B", weightKg: 2 } })]);

		expect((await bySku("P-1")).product.customFields).toEqual({
			grade: "B",
			weightKg: 2,
			notes: "Admin note"
		});
	});

	it("refuses fields the admin owns or values of the wrong type, before writing", async () => {
		await expect(
			upsert([part("P-1"), part("P-2", { customFields: { notes: "x" } })])
		).rejects.toThrow('P-2: notes is not a readOnly field of product type "part"');
		await expect(
			upsert([part("P-1", { customFields: { weightKg: "heavy" } })])
		).rejects.toThrow(/P-1: weightKg/);
		expect(await bySku("P-1")).toBeUndefined();
	});

	it("hides inactive products and shows them again when reactivated", async () => {
		await upsert([part("P-1")]);

		await upsert([part("P-1", { active: false })]);
		const { product } = await bySku("P-1");
		expect(product).toMatchObject({ visibility: "draft", deletedAt: null });
		expect((await indexed(product.id)).visibility).toBe("draft");

		await upsert([part("P-1")]);
		expect((await bySku("P-1")).product.visibility).toBe("public");
	});

	it("keeps a private product private while it is active", async () => {
		await upsert([part("P-1")]);
		const { product } = await bySku("P-1");
		await productService.update(product.id, { visibility: "private" });

		await upsert([part("P-1", { stock: 9 })]);

		expect((await bySku("P-1")).product.visibility).toBe("private");
	});

	it("hides products of the type missing from a complete pull, never other types", async () => {
		await upsert([part("P-1"), part("P-2")]);
		const other = await productService.create({ name: "Mug", slug: "mug", type: "physical" });
		await productService.createVariant({ productId: other.id, sku: "MUG", price: 900 });

		expect((await upsert([part("P-2")])).hidden).toBe(0);
		expect((await bySku("P-1")).product.visibility).toBe("public");

		const summary = await upsert([part("P-2")], true);

		expect(summary.hidden).toBe(1);
		expect((await bySku("P-1")).product).toMatchObject({
			visibility: "draft",
			deletedAt: null
		});
		expect((await bySku("MUG")).product.visibility).toBe("public");
	});

	it("creates nothing when the variant can't be created", async () => {
		const old = await productService.create({ name: "Old", slug: "old", type: "part" });
		// A deleted variant whose SKU was never released still holds the unique index
		await db
			.insert(productVariants)
			.values({ productId: old.id, sku: "P-1", price: 0, deletedAt: new Date() });

		await expect(upsert([part("P-1")])).rejects.toThrow();

		expect(await db.select().from(products)).toHaveLength(1);
	});

	it("clamps negative stock from the source to zero", async () => {
		await upsert([part("P-1", { stock: -3 })]);

		expect((await bySku("P-1")).variant.stock).toBe(0);
	});
});
