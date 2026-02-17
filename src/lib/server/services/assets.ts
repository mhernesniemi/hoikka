/**
 * Asset Service
 * Handles image storage with Vercel Blob
 */
import { db } from "$lib/server/db/index.js";
import { assets, productAssets, products, collections } from "$lib/server/db/schema.js";
import { eq, asc } from "drizzle-orm";
import { del } from "@vercel/blob";

export interface CreateAssetInput {
	name: string;
	url: string;
	width?: number;
	height?: number;
	fileSize?: number;
}

class AssetService {
	/**
	 * Create asset record after successful upload
	 */
	async create(input: CreateAssetInput) {
		const [asset] = await db
			.insert(assets)
			.values({
				name: input.name,
				type: "image",
				mimeType: "image/jpeg",
				source: input.url,
				width: input.width ?? 0,
				height: input.height ?? 0,
				fileSize: input.fileSize ?? 0
			})
			.returning();

		return asset;
	}

	/**
	 * Update asset alt text
	 */
	async updateAlt(assetId: number, alt: string) {
		const [asset] = await db
			.update(assets)
			.set({ alt })
			.where(eq(assets.id, assetId))
			.returning();

		return asset;
	}

	/**
	 * Add asset to product
	 */
	async addToProduct(productId: number, assetId: number, position?: number) {
		// Get current max position
		const existing = await db
			.select({ position: productAssets.position })
			.from(productAssets)
			.where(eq(productAssets.productId, productId))
			.orderBy(asc(productAssets.position));

		const nextPosition =
			position ?? (existing.length > 0 ? existing[existing.length - 1].position + 1 : 0);

		await db
			.insert(productAssets)
			.values({ productId, assetId, position: nextPosition })
			.onConflictDoNothing();

		// Set as featured if first image
		if (nextPosition === 0) {
			await db
				.update(products)
				.set({ featuredAssetId: assetId })
				.where(eq(products.id, productId));
		}
	}

	/**
	 * Remove asset from product
	 */
	async removeFromProduct(productId: number, assetId: number) {
		await db
			.delete(productAssets)
			.where(eq(productAssets.productId, productId) && eq(productAssets.assetId, assetId));

		// Check if this was the featured asset
		const [product] = await db.select().from(products).where(eq(products.id, productId));
		if (product?.featuredAssetId === assetId) {
			// Set next image as featured or null
			const remaining = await db
				.select({ assetId: productAssets.assetId })
				.from(productAssets)
				.where(eq(productAssets.productId, productId))
				.orderBy(asc(productAssets.position))
				.limit(1);

			await db
				.update(products)
				.set({ featuredAssetId: remaining[0]?.assetId ?? null })
				.where(eq(products.id, productId));
		}
	}

	/**
	 * Set featured asset for product
	 */
	async setFeaturedAsset(productId: number, assetId: number) {
		await db
			.update(products)
			.set({ featuredAssetId: assetId })
			.where(eq(products.id, productId));
	}

	/**
	 * Set featured asset for collection
	 */
	async addToCollection(collectionId: number, assetId: number) {
		await db
			.update(collections)
			.set({ featuredAssetId: assetId })
			.where(eq(collections.id, collectionId));
	}

	/**
	 * Remove featured asset from collection and delete the asset
	 */
	async removeFromCollection(collectionId: number, assetId: number) {
		await db
			.update(collections)
			.set({ featuredAssetId: null })
			.where(eq(collections.id, collectionId));

		await this.delete(assetId);
	}

	/**
	 * Delete asset (removes from Vercel Blob and database)
	 */
	async delete(assetId: number) {
		const asset = await db.query.assets.findFirst({
			where: eq(assets.id, assetId)
		});

		if (asset?.source) {
			try {
				await del(asset.source);
			} catch {
				// Blob may already be deleted — continue with DB cleanup
			}
		}

		await db.delete(assets).where(eq(assets.id, assetId));
	}
}

export const assetService = new AssetService();
