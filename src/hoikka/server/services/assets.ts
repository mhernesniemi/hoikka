/**
 * Asset Service
 * Handles image storage on the local filesystem (static/uploads/).
 */
import { db } from "@hoikka/core/server/db/index";
import {
	assets,
	digitalDownloads,
	orderLines,
	productAssets,
	products,
	productVariants,
	collections
} from "@hoikka/core/server/db/schema";
import { and, eq, asc, desc, isNotNull, isNull, notInArray, notLike } from "drizzle-orm";
import { remove as removeFile } from "@hoikka/core/server/storage/index";
import { dbError } from "@hoikka/core/server/db-error";
import { PRIVATE_PREFIX, PUBLIC_PREFIX } from "@hoikka/core/server/storage/types";

const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".avif": "image/avif",
	// Deliverable files for digital products
	".pdf": "application/pdf",
	".epub": "application/epub+zip",
	".zip": "application/zip",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".mp4": "video/mp4",
	".txt": "text/plain",
	".csv": "text/csv"
};

const ASSET_TYPES: Record<string, "image" | "video" | "document" | "other"> = {
	"application/pdf": "document",
	"application/epub+zip": "document",
	"text/plain": "document",
	"text/csv": "document",
	"video/mp4": "video"
};

function mimeFromFilename(filename: string, fallback = "image/jpeg"): string {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	return MIME_TYPES[ext] ?? fallback;
}

function assetTypeFor(mimeType: string): "image" | "video" | "document" | "other" {
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "other";
	return ASSET_TYPES[mimeType] ?? "other";
}

export interface CreateAssetInput {
	name: string;
	url: string;
	width?: number;
	height?: number;
	fileSize?: number;
	/** Explicit MIME type for non-image files (digital product deliverables). */
	mimeType?: string;
}

/** Extract the original filename from a storage URL.
 *  Both the new local storage and the legacy Vercel Blob format append
 *  `-<id>` before the extension; strip it to recover the original name. */
function storedFilename(url: string): string {
	const segment = decodeURIComponent(url.split("/").pop() || "image");
	return segment.replace(/-[A-Za-z0-9]{10,}(\.\w+)$/, "$1");
}

class AssetService {
	/**
	 * List all assets ordered by creation date (newest first)
	 */
	async list() {
		return db.select().from(assets).where(this.notPrivate()).orderBy(desc(assets.createdAt));
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
	 * Digital deliverables are not part of the image library — they are picked
	 * on the product page, never browsed as media.
	 */
	private notPrivate() {
		return notLike(assets.source, `${PUBLIC_PREFIX}/${PRIVATE_PREFIX}/%`);
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
		data: { name?: string; alt?: string; focalX?: number; focalY?: number }
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
		const mimeType = input.mimeType ?? mimeFromFilename(input.name);
		const [asset] = await db
			.insert(assets)
			.values({
				name: input.name,
				type: assetTypeFor(mimeType),
				mimeType,
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
			.where(and(eq(productAssets.productId, productId), eq(productAssets.assetId, assetId)));

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
				and(
					isNotNull(productVariants.imageUrl),
					isNull(productVariants.deletedAt),
					notInArray(productVariants.imageUrl, existingUrls)
				)
			);

		for (const row of untracked) {
			if (!row.imageUrl) continue;
			const name = storedFilename(row.imageUrl);
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
			.where(and(eq(assets.width, 0), this.notPrivate()));
		for (const asset of backfilled) {
			if (!asset.source) continue;
			const correctName = storedFilename(asset.source);
			if (correctName !== asset.name) {
				await db.update(assets).set({ name: correctName }).where(eq(assets.id, asset.id));
			}
		}
	}

	/**
	 * Why an asset cannot be deleted, or null when it can be. Deliverables that
	 * customers have already paid for are not disposable: removing one would
	 * silently revoke downloads that were sold.
	 */
	async deletionBlocker(assetId: number): Promise<string | null> {
		const [usedByProduct] = await db
			.select({ id: products.id, name: products.name })
			.from(products)
			.where(and(eq(products.digitalAssetId, assetId), isNull(products.deletedAt)))
			.limit(1);
		if (usedByProduct) {
			return `This file is the deliverable for "${usedByProduct.name}". Remove it from the product first.`;
		}

		// A line that was sold with this file pins it, and that pin is a promise
		// to a customer whose grant may not exist yet — between pinning and
		// grant creation, nothing else would stop the file being deleted.
		const [soldWith] = await db
			.select({ orderId: orderLines.orderId })
			.from(orderLines)
			.where(eq(orderLines.digitalAssetId, assetId))
			.limit(1);
		if (soldWith) {
			return "This file was sold on an existing order and cannot be deleted.";
		}

		// Every grant blocks, not just the unexpired ones: the foreign key does,
		// and a blocker that disagreed with it would delete the file from
		// storage and only then fail on the database, leaving an asset row
		// pointing at nothing. Spent grants are cleared by housekeeping, after
		// which the asset becomes deletable on its own.
		const [grant] = await db
			.select({ expiresAt: digitalDownloads.expiresAt })
			.from(digitalDownloads)
			.where(eq(digitalDownloads.assetId, assetId))
			.orderBy(desc(digitalDownloads.expiresAt))
			.limit(1);
		if (grant) {
			return grant.expiresAt.getTime() > Date.now()
				? "Customers still have valid download links to this file."
				: "This file was sold and its download links have not been cleared yet. It can be deleted once they are.";
		}

		return null;
	}

	/**
	 * Delete asset (removes from storage and database)
	 */
	async delete(assetId: number) {
		const blocker = await this.deletionBlocker(assetId);
		if (blocker) throw new ProtectedAssetError(blocker);

		const asset = await db.query.assets.findFirst({
			where: eq(assets.id, assetId)
		});

		// Database first. If a foreign key still holds the row, the delete
		// throws and the file is left where it is — the alternative order would
		// destroy the file and then fail, leaving a record pointing at nothing.
		await db.delete(assets).where(eq(assets.id, assetId));

		if (asset?.source) {
			try {
				await removeFile(asset.source);
			} catch {
				// File may already be gone — the record is what mattered
			}
		}
	}
}

export const assetService = new AssetService();

/**
 * Thrown when an asset is still doing a job — a product's deliverable, or a
 * download somebody paid for. The message is written for the admin, so unlike
 * a raw database error it is shown as-is.
 */
export class ProtectedAssetError extends Error {}

/** Message for an asset-deletion failure: explicit reason, or a DB fallback. */
export function assetDeleteError(error: unknown, fallback: string): string {
	return error instanceof ProtectedAssetError ? error.message : dbError(error, fallback);
}
