/**
 * Asset Service
 * Handles image storage with Vercel Blob
 */
import { db } from "$lib/server/db/index.js";
import {
	assets,
	productAssets,
	products,
	productVariants,
	collections
} from "$lib/server/db/schema.js";
import { eq, asc, desc, isNotNull, isNull, notInArray } from "drizzle-orm";
import { del } from "@vercel/blob";

const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".avif": "image/avif"
};

function mimeFromFilename(filename: string): string {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	return MIME_TYPES[ext] ?? "image/jpeg";
}

export interface CreateAssetInput {
	name: string;
	url: string;
	width?: number;
	height?: number;
	fileSize?: number;
}

/** Extract original filename from a Vercel Blob URL.
 *  Vercel Blob's `addRandomSuffix` appends `-<base64>` before the extension.
 *  e.g. ".../tomato-green-Tkyz2j6VRrYabc.png" → "tomato-green.png" */
function blobFilename(url: string): string {
	const segment = decodeURIComponent(url.split("/").pop() || "image");
	return segment.replace(/-[A-Za-z0-9]{10,}(\.\w+)$/, "$1");
}

class AssetService {
	/**
	 * List all assets ordered by creation date (newest first)
	 */
	async list() {
		return db.select().from(assets).orderBy(desc(assets.createdAt));
	}

	/**
	 * Get a single asset by ID
	 */
	async getById(id: number) {
		return db.query.assets.findFirst({
			where: eq(assets.id, id)
		});
	}

	/**
	 * Check if an asset with the given source URL exists
	 */
	async existsByUrl(url: string): Promise<boolean> {
		const result = await db.query.assets.findFirst({
			where: eq(assets.source, url),
			columns: { id: true }
		});
		return !!result;
	}

	/**
	 * Update asset name and/or alt text
	 */
	async update(
		id: number,
		data: { name?: string; alt?: string; focalX?: string; focalY?: string }
	) {
		const [asset] = await db.update(assets).set(data).where(eq(assets.id, id)).returning();

		return asset;
	}

	/**
	 * Find an existing asset by its source URL
	 */
	async getBySource(source: string) {
		const [asset] = await db.select().from(assets).where(eq(assets.source, source)).limit(1);
		return asset ?? null;
	}

	/**
	 * Create asset record after successful upload
	 */
	async create(input: CreateAssetInput) {
		const [asset] = await db
			.insert(assets)
			.values({
				name: input.name,
				type: "image",
				mimeType: mimeFromFilename(input.name),
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
	 * Create asset records for variant images that aren't tracked yet
	 */
	async backfillVariantImages() {
		const existingUrls = db.select({ source: assets.source }).from(assets);
		const untracked = await db
			.select({ imageUrl: productVariants.imageUrl })
			.from(productVariants)
			.where(
				isNotNull(productVariants.imageUrl) &&
					isNull(productVariants.deletedAt) &&
					notInArray(productVariants.imageUrl, existingUrls)
			);

		for (const row of untracked) {
			if (!row.imageUrl) continue;
			const name = blobFilename(row.imageUrl);
			await db
				.insert(assets)
				.values({
					name,
					type: "image",
					mimeType: mimeFromFilename(name),
					source: row.imageUrl,
					width: 0,
					height: 0,
					fileSize: 0
				})
				.onConflictDoNothing();
		}

		// Fix names of previously backfilled assets (width=0 means not from upload)
		const backfilled = await db
			.select({ id: assets.id, name: assets.name, source: assets.source })
			.from(assets)
			.where(eq(assets.width, 0));
		for (const asset of backfilled) {
			if (!asset.source) continue;
			const correctName = blobFilename(asset.source);
			if (correctName !== asset.name) {
				await db.update(assets).set({ name: correctName }).where(eq(assets.id, asset.id));
			}
		}
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
