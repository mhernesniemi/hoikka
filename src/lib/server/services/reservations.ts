/**
 * Stock Reservation Service
 * Prevents overselling during checkout.
 *
 * Reservation Pattern (checkout-only):
 * - Nothing is reserved while shopping — the cart is a cookie
 * - When checkout starts, each order line reserves stock for
 *   RESERVATION_TIMEOUT_MINUTES
 * - On payment: reservations released, stock deducted
 * - Expired reservations are deleted opportunistically at checkout entry and
 *   filtered out of every availability read — no background job needed
 */
import { eq, and, gt, lte, sql, sum } from "drizzle-orm";
import { db } from "../db/index.js";
import { stockReservations, productVariants } from "../db/schema.js";

// Reservation timeout in minutes
const RESERVATION_TIMEOUT_MINUTES = 15;

export class ReservationService {
	/**
	 * Get available stock for a variant (total stock minus active reservations)
	 */
	async getAvailableStock(variantId: number): Promise<number> {
		// Get variant's total stock and tracking setting
		const [variant] = await db
			.select({
				stock: productVariants.stock,
				trackInventory: productVariants.trackInventory
			})
			.from(productVariants)
			.where(eq(productVariants.id, variantId));

		if (!variant) return 0;

		// If inventory tracking is disabled, stock is unlimited
		if (!variant.trackInventory) return Infinity;

		// Get sum of active (non-expired) reservations
		const [result] = await db
			.select({ reserved: sum(stockReservations.quantity) })
			.from(stockReservations)
			.where(
				and(
					eq(stockReservations.variantId, variantId),
					gt(stockReservations.expiresAt, new Date())
				)
			);

		const reserved = Number(result?.reserved ?? 0);

		return Math.max(0, variant.stock - reserved);
	}

	/**
	 * Get available stock for a variant, excluding reservations from a specific order
	 * Used when checking stock for existing cart items
	 */
	async getAvailableStockExcludingOrder(variantId: number, orderId: number): Promise<number> {
		// Get variant's total stock and tracking setting
		const [variant] = await db
			.select({
				stock: productVariants.stock,
				trackInventory: productVariants.trackInventory
			})
			.from(productVariants)
			.where(eq(productVariants.id, variantId));

		if (!variant) return 0;

		// If inventory tracking is disabled, stock is unlimited
		if (!variant.trackInventory) return Infinity;

		// Get sum of active (non-expired) reservations excluding this order
		const [result] = await db
			.select({ reserved: sum(stockReservations.quantity) })
			.from(stockReservations)
			.where(
				and(
					eq(stockReservations.variantId, variantId),
					gt(stockReservations.expiresAt, new Date()),
					sql`${stockReservations.orderId} != ${orderId}`
				)
			);

		const reserved = Number(result?.reserved ?? 0);

		return Math.max(0, variant.stock - reserved);
	}

	/**
	 * Create a reservation for a cart line item
	 */
	async reserve(
		variantId: number,
		orderId: number,
		orderLineId: number,
		quantity: number
	): Promise<void> {
		const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MINUTES * 60 * 1000);

		await db.insert(stockReservations).values({
			variantId,
			orderId,
			orderLineId,
			quantity,
			expiresAt
		});
	}

	/**
	 * Release all reservations for an order
	 */
	async releaseForOrder(orderId: number): Promise<void> {
		await db.delete(stockReservations).where(eq(stockReservations.orderId, orderId));
	}

	/**
	 * Release an order's reservations for one variant (the shopper dropped it
	 * from the cart mid-checkout — its stock should free up immediately)
	 */
	async releaseForVariant(orderId: number, variantId: number): Promise<void> {
		await db
			.delete(stockReservations)
			.where(
				and(
					eq(stockReservations.orderId, orderId),
					eq(stockReservations.variantId, variantId)
				)
			);
	}

	/**
	 * Delete expired reservations (called opportunistically at checkout entry)
	 */
	async deleteExpired(): Promise<void> {
		await db.delete(stockReservations).where(lte(stockReservations.expiresAt, new Date()));
	}
}

// Export singleton instance
export const reservationService = new ReservationService();
