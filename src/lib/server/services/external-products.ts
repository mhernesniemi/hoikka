/**
 * Products owned by an external system (ERP, PIM), one variant per SKU, so a
 * sync never writes `products` or `productVariants` itself.
 *
 * The system owns the name, stock, price, active flag and the product type's
 * readOnly fields; the rest stays the admin's. Inactive products are hidden
 * as drafts, never deleted, so old order lines can still name them; with
 * `hideMissing` (a complete pull) so are products of the type whose SKUs are
 * missing. Only changed products are reindexed.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import config from "#hoikka/config";
import { db, atomic } from "../db/index.js";
import { products, productVariants } from "../db/schema.js";
import { parseFields } from "#lib/fields/index.js";
import { slugify } from "#lib/utils.js";
import type { Product, ProductVariant } from "#lib/types.js";
import { reindexProduct } from "./reindex.js";

export interface ExternalProductRow {
	sku: string;
	name: string;
	/** Inactive products are hidden as drafts, never deleted. */
	active: boolean;
	stock: number;
	/** In cents. When omitted, an existing price is kept and a new product gets 0. */
	price?: number;
	/** Only the product type's readOnly fields; the others belong to the admin. */
	customFields?: Record<string, unknown>;
}

export interface UpsertProductsSummary {
	total: number;
	created: number;
	updated: number;
	hidden: number;
}

// D1 binds at most 100 parameters per statement
const CHUNK = 100;

/** The rows' readOnly field values by SKU. Throws before anything is written. */
function ownedFields(rows: readonly ExternalProductRow[], productType: string) {
	const defs = config.productTypes[productType]?.fields;
	if (!defs) throw new Error(`No product type "${productType}" in hoikka.config.ts`);
	const owned = defs.filter((def) => def.readOnly);

	const fieldsBySku = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		if (fieldsBySku.has(row.sku)) throw new Error(`Duplicate SKU "${row.sku}"`);
		const raw = row.customFields ?? {};
		const notOwned = Object.keys(raw).filter((key) => !owned.some((def) => def.key === key));
		if (notOwned.length > 0) {
			throw new Error(
				`${row.sku}: ${notOwned.join(", ")} is not a readOnly field of product type "${productType}"`
			);
		}
		const parsed = parseFields(owned, raw);
		if (!parsed.ok) throw new Error(`${row.sku}: ${parsed.error}`);
		fieldsBySku.set(row.sku, parsed.values);
	}
	return fieldsBySku;
}

async function variantsBySku(skus: string[]) {
	const found = new Map<string, { product: Product; variant: ProductVariant }>();
	for (let i = 0; i < skus.length; i += CHUNK) {
		const rows = await db
			.select({ product: products, variant: productVariants })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(
				and(
					inArray(productVariants.sku, skus.slice(i, i + CHUNK)),
					isNull(productVariants.deletedAt)
				)
			);
		for (const row of rows) found.set(row.variant.sku, row);
	}
	return found;
}

/** Hide the type's shown products that have no SKU in the pull. */
async function hideMissingProducts(productType: string, listed: Set<string>): Promise<number[]> {
	const shown = await db
		.select({ id: products.id, sku: productVariants.sku })
		.from(products)
		.innerJoin(productVariants, eq(productVariants.productId, products.id))
		.where(
			and(
				eq(products.type, productType),
				ne(products.visibility, "draft"),
				isNull(products.deletedAt),
				isNull(productVariants.deletedAt)
			)
		);
	const kept = new Set(shown.filter((row) => listed.has(row.sku)).map((row) => row.id));
	const missing = [...new Set(shown.map((row) => row.id))].filter((id) => !kept.has(id));
	for (let i = 0; i < missing.length; i += CHUNK) {
		await db
			.update(products)
			.set({ visibility: "draft" })
			.where(inArray(products.id, missing.slice(i, i + CHUNK)));
	}
	return missing;
}

export async function upsertProductsBySku(
	rows: readonly ExternalProductRow[],
	{ productType, hideMissing = false }: { productType: string; hideMissing?: boolean }
): Promise<UpsertProductsSummary> {
	const fieldsBySku = ownedFields(rows, productType);
	const existing = await variantsBySku([...fieldsBySku.keys()]);
	const summary: UpsertProductsSummary = {
		total: rows.length,
		created: 0,
		updated: 0,
		hidden: 0
	};
	const reindex = new Set<number>();
	const created: string[] = [];

	for (const row of rows) {
		const customFields = fieldsBySku.get(row.sku)!;
		// The storefront has no use for negative stock, and a trigger refuses it
		const stock = Math.max(0, row.stock);
		const found = existing.get(row.sku);

		if (!found) {
			await atomic([
				db.insert(products).values({
					name: row.name,
					slug: slugify(row.name),
					type: productType,
					visibility: row.active ? "public" : "draft",
					customFields
				}),
				// Same batch, same connection: the product inserted just above
				db.insert(productVariants).values({
					productId: sql`last_insert_rowid()`,
					sku: row.sku,
					price: row.price ?? 0,
					stock
				})
			]);
			created.push(row.sku);
			continue;
		}

		const { product, variant } = found;
		// A private product stays private; only draft and public follow the flag
		const visibility = !row.active
			? "draft"
			: product.visibility === "draft"
				? "public"
				: product.visibility;
		const merged = { ...product.customFields, ...customFields };
		const productChanged =
			product.name !== row.name ||
			product.visibility !== visibility ||
			JSON.stringify(product.customFields) !== JSON.stringify(merged);
		const price = row.price ?? variant.price;
		const variantChanged = variant.stock !== stock || variant.price !== price;
		if (!productChanged && !variantChanged) continue;

		// Stock and price reach the search index through triggers
		await atomic([
			...(productChanged
				? [
						db
							.update(products)
							.set({ name: row.name, visibility, customFields: merged })
							.where(eq(products.id, product.id))
					]
				: []),
			...(variantChanged
				? [
						db
							.update(productVariants)
							.set({ stock, price })
							.where(eq(productVariants.id, variant.id))
					]
				: [])
		]);
		summary.updated++;
		if (productChanged) reindex.add(product.id);
	}

	for (const { product } of (await variantsBySku(created)).values()) reindex.add(product.id);
	summary.created = created.length;

	if (hideMissing) {
		const hidden = await hideMissingProducts(productType, new Set(fieldsBySku.keys()));
		summary.hidden = hidden.length;
		for (const id of hidden) reindex.add(id);
	}

	for (const id of reindex) await reindexProduct(db, id);
	return summary;
}
