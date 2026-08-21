import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	productTranslations,
	productVariantTranslations,
	facetTranslations,
	facetValueTranslations,
	facetValues,
	collectionTranslations,
	categoryTranslations,
	contentPageTranslations,
	assetTranslations
} from "../db/schema.js";

// ── Generic helper ──────────────────────────────────────────────────
// Extracts the repeated Drizzle get + upsert pattern.
// Uses `any` because Drizzle's table generics are too complex for
// a cross-table helper — all call sites remain fully typed.

/* eslint-disable @typescript-eslint/no-explicit-any */
function translationOps<TRow>(table: any, fkColumn: any, fkProp: string) {
	return {
		get: (entityId: number): Promise<TRow[]> =>
			db.select().from(table).where(eq(fkColumn, entityId)) as any,

		upsert: async (
			entityId: number,
			languageCode: string,
			data: Record<string, string | null>
		) => {
			await db
				.insert(table)
				.values({ ...data, [fkProp]: entityId, languageCode })
				.onConflictDoUpdate({ target: [fkColumn, table.languageCode], set: data });
		}
	};
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const product = translationOps<typeof productTranslations.$inferSelect>(
	productTranslations,
	productTranslations.productId,
	"productId"
);
const variant = translationOps<typeof productVariantTranslations.$inferSelect>(
	productVariantTranslations,
	productVariantTranslations.variantId,
	"variantId"
);
const facet = translationOps<typeof facetTranslations.$inferSelect>(
	facetTranslations,
	facetTranslations.facetId,
	"facetId"
);
const facetValueOps = translationOps<typeof facetValueTranslations.$inferSelect>(
	facetValueTranslations,
	facetValueTranslations.facetValueId,
	"facetValueId"
);
const collection = translationOps<typeof collectionTranslations.$inferSelect>(
	collectionTranslations,
	collectionTranslations.collectionId,
	"collectionId"
);
const categoryOps = translationOps<typeof categoryTranslations.$inferSelect>(
	categoryTranslations,
	categoryTranslations.categoryId,
	"categoryId"
);
const contentPage = translationOps<typeof contentPageTranslations.$inferSelect>(
	contentPageTranslations,
	contentPageTranslations.contentPageId,
	"contentPageId"
);
const assetOps = translationOps<typeof assetTranslations.$inferSelect>(
	assetTranslations,
	assetTranslations.assetId,
	"assetId"
);

// ── Service ─────────────────────────────────────────────────────────

export class TranslationService {
	// ── Products ──────────────────────────────────────────────────────────

	getProductTranslations(productId: number) {
		return product.get(productId);
	}

	upsertProductTranslation(
		productId: number,
		languageCode: string,
		data: { name: string; slug: string; description?: string | null }
	) {
		return product.upsert(productId, languageCode, {
			name: data.name,
			slug: data.slug,
			description: data.description ?? null
		});
	}

	// ── Product Variants ─────────────────────────────────────────────────

	getVariantTranslations(variantId: number) {
		return variant.get(variantId);
	}

	upsertVariantTranslation(
		variantId: number,
		languageCode: string,
		data: { name?: string | null }
	) {
		return variant.upsert(variantId, languageCode, { name: data.name ?? null });
	}

	// ── Facets ────────────────────────────────────────────────────────────

	getFacetTranslations(facetId: number) {
		return facet.get(facetId);
	}

	upsertFacetTranslation(facetId: number, languageCode: string, data: { name: string }) {
		return facet.upsert(facetId, languageCode, { name: data.name });
	}

	// ── Facet Values ─────────────────────────────────────────────────────

	upsertFacetValueTranslation(
		facetValueId: number,
		languageCode: string,
		data: { name: string }
	) {
		return facetValueOps.upsert(facetValueId, languageCode, { name: data.name });
	}

	async getAllFacetValueTranslations(facetId: number) {
		const vals = await db
			.select({ id: facetValues.id })
			.from(facetValues)
			.where(eq(facetValues.facetId, facetId));

		const ids = vals.map((v) => v.id);
		if (ids.length === 0) return {};

		const rows = await db
			.select()
			.from(facetValueTranslations)
			.where(inArray(facetValueTranslations.facetValueId, ids));

		const map: Record<number, typeof rows> = {};
		for (const row of rows) {
			(map[row.facetValueId] ??= []).push(row);
		}
		return map;
	}

	// ── Collections ──────────────────────────────────────────────────────

	getCollectionTranslations(collectionId: number) {
		return collection.get(collectionId);
	}

	upsertCollectionTranslation(
		collectionId: number,
		languageCode: string,
		data: { name: string; slug: string; description?: string | null }
	) {
		return collection.upsert(collectionId, languageCode, {
			name: data.name,
			slug: data.slug,
			description: data.description ?? null
		});
	}

	// ── Categories ───────────────────────────────────────────────────────

	getCategoryTranslations(categoryId: number) {
		return categoryOps.get(categoryId);
	}

	upsertCategoryTranslation(categoryId: number, languageCode: string, data: { name: string }) {
		return categoryOps.upsert(categoryId, languageCode, { name: data.name });
	}

	async getAllCategoryTranslations() {
		const rows = await db.select().from(categoryTranslations);

		const map: Record<number, typeof rows> = {};
		for (const row of rows) {
			(map[row.categoryId] ??= []).push(row);
		}
		return map;
	}

	// ── Assets ───────────────────────────────────────────────────────────

	getAssetTranslations(assetId: number) {
		return assetOps.get(assetId);
	}

	upsertAssetTranslation(assetId: number, languageCode: string, data: { alt?: string | null }) {
		return assetOps.upsert(assetId, languageCode, { alt: data.alt ?? null });
	}

	async getAllAssetTranslations(assetIds: number[]) {
		if (assetIds.length === 0) return {};

		const rows = await db
			.select()
			.from(assetTranslations)
			.where(inArray(assetTranslations.assetId, assetIds));

		const map: Record<number, typeof rows> = {};
		for (const row of rows) {
			(map[row.assetId] ??= []).push(row);
		}
		return map;
	}

	// ── Content Pages ────────────────────────────────────────────────────

	getContentPageTranslations(pageId: number) {
		return contentPage.get(pageId);
	}

	upsertContentPageTranslation(
		pageId: number,
		languageCode: string,
		data: { title: string; slug: string; body?: string | null }
	) {
		return contentPage.upsert(pageId, languageCode, {
			title: data.title,
			slug: data.slug,
			body: data.body ?? null
		});
	}
}

export const translationService = new TranslationService();
