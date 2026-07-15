/**
 * Wishlist Service - Domain Logic Only
 *
 * Handles:
 * - Creating/getting wishlists
 * - Adding/removing/toggling items
 * - Merging guest wishlist on login
 *
 * Does NOT handle:
 * - Loading product data (use ProductService for that)
 * - View model building (compose at route level)
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wishlists, wishlistItems } from "../db/schema.js";
import type { Wishlist, WishlistItem } from "$lib/types.js";
import { nanoid } from "nanoid";

function generateGuestToken(): string {
	return nanoid(32);
}

export class WishlistService {
	/**
	 * Get or create a wishlist
	 */
	async getOrCreate(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<{ wishlist: Wishlist; guestToken: string | null; isNew: boolean }> {
		const { customerId, guestToken } = opts;

		// Find existing
		const wishlist = await this.get({ customerId, guestToken });

		if (wishlist) {
			return { wishlist, guestToken: wishlist.guestToken, isNew: false };
		}

		// Create new
		const newGuestToken = customerId ? null : generateGuestToken();
		const [created] = await db
			.insert(wishlists)
			.values({
				customerId: customerId ?? null,
				guestToken: newGuestToken
			})
			.returning();

		return { wishlist: created, guestToken: newGuestToken, isNew: true };
	}

	/**
	 * Get wishlist (without creating)
	 */
	async get(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<Wishlist | null> {
		const { customerId, guestToken } = opts;

		if (customerId) {
			const [wishlist] = await db
				.select()
				.from(wishlists)
				.where(eq(wishlists.customerId, customerId));
			return wishlist ?? null;
		}

		if (guestToken) {
			const [wishlist] = await db
				.select()
				.from(wishlists)
				.where(eq(wishlists.guestToken, guestToken));
			return wishlist ?? null;
		}

		return null;
	}

	/**
	 * Get all items in wishlist (just IDs, no product data)
	 */
	async getItems(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<WishlistItem[]> {
		const wishlist = await this.get(opts);
		if (!wishlist) return [];

		return db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, wishlist.id));
	}

	/**
	 * Get just the product IDs (for quick lookups)
	 */
	async getProductIds(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<number[]> {
		const items = await this.getItems(opts);
		return items.map((item) => item.productId);
	}

	/**
	 * Add item to wishlist
	 */
	async addItem(opts: {
		productId: number;
		variantId?: number | null;
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<{ item: WishlistItem; guestToken: string | null }> {
		const { productId, variantId, customerId, guestToken } = opts;

		const { wishlist, guestToken: newToken } = await this.getOrCreate({
			customerId,
			guestToken
		});

		// Check if already exists
		const [existing] = await db
			.select()
			.from(wishlistItems)
			.where(
				and(
					eq(wishlistItems.wishlistId, wishlist.id),
					eq(wishlistItems.productId, productId)
				)
			);

		if (existing) {
			return { item: existing, guestToken: newToken };
		}

		// Insert new
		const [item] = await db
			.insert(wishlistItems)
			.values({
				wishlistId: wishlist.id,
				productId,
				variantId: variantId ?? null
			})
			.returning();

		await this.touch(wishlist.id);

		return { item, guestToken: newToken };
	}

	/**
	 * Remove item from wishlist
	 */
	async removeItem(opts: {
		productId: number;
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<boolean> {
		const { productId, customerId, guestToken } = opts;

		const wishlist = await this.get({ customerId, guestToken });
		if (!wishlist) return false;

		const result = await db
			.delete(wishlistItems)
			.where(
				and(
					eq(wishlistItems.wishlistId, wishlist.id),
					eq(wishlistItems.productId, productId)
				)
			);

		await this.touch(wishlist.id);

		return true;
	}

	/**
	 * Toggle item in wishlist (add if missing, remove if present)
	 */
	async toggleItem(opts: {
		productId: number;
		variantId?: number | null;
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<{ added: boolean; guestToken: string | null }> {
		const { productId, variantId, customerId, guestToken } = opts;

		const isInWishlist = await this.hasItem({ productId, customerId, guestToken });

		if (isInWishlist) {
			await this.removeItem({ productId, customerId, guestToken });
			return { added: false, guestToken: guestToken ?? null };
		} else {
			const { guestToken: newToken } = await this.addItem({
				productId,
				variantId,
				customerId,
				guestToken
			});
			return { added: true, guestToken: newToken };
		}
	}

	/**
	 * Check if product is in wishlist
	 */
	async hasItem(opts: {
		productId: number;
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<boolean> {
		const { productId, customerId, guestToken } = opts;

		const wishlist = await this.get({ customerId, guestToken });
		if (!wishlist) return false;

		const [item] = await db
			.select()
			.from(wishlistItems)
			.where(
				and(
					eq(wishlistItems.wishlistId, wishlist.id),
					eq(wishlistItems.productId, productId)
				)
			);

		return !!item;
	}

	/**
	 * Get item count
	 */
	async getCount(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<number> {
		const items = await this.getItems(opts);
		return items.length;
	}

	/**
	 * Clear all items
	 */
	async clear(opts: {
		customerId?: number | null;
		guestToken?: string | null;
	}): Promise<boolean> {
		const wishlist = await this.get(opts);
		if (!wishlist) return false;

		await db.delete(wishlistItems).where(eq(wishlistItems.wishlistId, wishlist.id));
		await this.touch(wishlist.id);

		return true;
	}

	/**
	 * Transfer guest wishlist to customer (merge on login)
	 */
	async transferToCustomer(guestToken: string, customerId: number): Promise<boolean> {
		const guestWishlist = await this.get({ guestToken });
		if (!guestWishlist) return false;

		const customerWishlist = await this.get({ customerId });

		if (customerWishlist) {
			// Merge: move items from guest to customer wishlist
			const guestItems = await db
				.select()
				.from(wishlistItems)
				.where(eq(wishlistItems.wishlistId, guestWishlist.id));

			for (const item of guestItems) {
				// Check if already exists in customer wishlist
				const [existing] = await db
					.select()
					.from(wishlistItems)
					.where(
						and(
							eq(wishlistItems.wishlistId, customerWishlist.id),
							eq(wishlistItems.productId, item.productId)
						)
					);

				if (!existing) {
					await db.insert(wishlistItems).values({
						wishlistId: customerWishlist.id,
						productId: item.productId,
						variantId: item.variantId
					});
				}
			}

			// Delete guest wishlist
			await db.delete(wishlists).where(eq(wishlists.id, guestWishlist.id));
		} else {
			// Transfer ownership
			await db
				.update(wishlists)
				.set({ customerId, guestToken: null })
				.where(eq(wishlists.id, guestWishlist.id));
		}

		return true;
	}

	private async touch(wishlistId: number): Promise<void> {
		await db
			.update(wishlists)
			.set({ updatedAt: sql`now()` })
			.where(eq(wishlists.id, wishlistId));
	}
}

export const wishlistService = new WishlistService();
