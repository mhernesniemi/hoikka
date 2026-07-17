/**
 * Cart remote functions.
 *
 * The cart lives in a cookie (see $lib/server/cart-cookie.ts) — these
 * functions read and mutate that cookie, so shopping never writes to the
 * database. `getCart` is a SvelteKit `query()`; each mutating `command()`
 * updates the cookie and then refreshes the query in the same roundtrip
 * (single-flight mutation), so the client cart updates without extra
 * requests.
 */
import { query, command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "$lib/server/db/index.js";
import { productVariants } from "$lib/server/db/schema.js";
import {
	CART_COOKIE,
	CART_COOKIE_OPTIONS,
	CHECKOUT_COOKIE,
	parseCartCookie,
	serializeCartCookie,
	addLine,
	setQuantity,
	removeLine,
	type CartLine
} from "$lib/server/cart-cookie.js";
import { getCartView, clampToAvailable } from "$lib/server/services/cart.js";
import { reservationService } from "$lib/server/services/reservations.js";
import { orderService } from "$lib/server/services/orders.js";

function readLines(): CartLine[] {
	return parseCartCookie(getRequestEvent().cookies.get(CART_COOKIE));
}

function writeLines(lines: CartLine[]): void {
	getRequestEvent().cookies.set(CART_COOKIE, serializeCartCookie(lines), CART_COOKIE_OPTIONS);
}

/**
 * When a checkout draft is active, its 15-minute stock reservations must
 * shrink with the cart — otherwise items removed (or a cart emptied)
 * mid-checkout keep blocking stock for other shoppers until expiry.
 * Quantity *reductions* are left to the reconcile on next checkout entry;
 * dropped lines and an emptied cart release immediately.
 */
async function syncCheckoutReservations(lines: CartLine[]): Promise<void> {
	const { cookies } = getRequestEvent();
	const token = cookies.get(CHECKOUT_COOKIE);
	if (!token) return;
	const draft = await orderService.getDraftByToken(token);
	if (!draft) return;

	if (lines.length === 0) {
		// Cart emptied mid-checkout — the draft is abandoned, free its stock
		await reservationService.releaseForOrder(draft.id);
		cookies.delete(CHECKOUT_COOKIE, { path: "/" });
		return;
	}

	const inCart = new Set(lines.map((l) => l.variantId));
	for (const line of draft.lines) {
		if (!inCart.has(line.variantId)) {
			await reservationService.releaseForVariant(draft.id, line.variantId);
		}
	}
}

export const getCart = query(async () => {
	const { locals } = getRequestEvent();
	return getCartView(readLines(), locals.customer?.id ?? null);
});

const variantIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const quantitySchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999));

export const addToCart = command(
	v.object({ variantId: variantIdSchema, quantity: quantitySchema }),
	async ({ variantId, quantity }) => {
		// Expected business failures use error(400, …): a plain throw is masked
		// as "An unexpected error occurred" in production, so the message would
		// never reach the shopper
		const [variant] = await db
			.select({ trackInventory: productVariants.trackInventory })
			.from(productVariants)
			.where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)));
		if (!variant) error(400, "Product is no longer available");

		const lines = readLines();
		if (variant.trackInventory) {
			const available = await reservationService.getAvailableStock(variantId);
			const inCart = lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
			if (inCart + quantity > available) {
				// Reservations from active checkouts count against stock, so
				// "0 available" can be temporary — say so
				error(
					400,
					available <= 0
						? "Out of stock right now — items in active checkouts may free up within minutes"
						: `Only ${available} items available${inCart > 0 ? ` (${inCart} already in cart)` : ""}`
				);
			}
		}

		writeLines(addLine(lines, variantId, quantity));
		await getCart().refresh();
	}
);

export const setCartQuantity = command(
	v.object({
		variantId: variantIdSchema,
		quantity: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999))
	}),
	async ({ variantId, quantity }) => {
		// Clamp to available stock instead of erroring — the cart view shows
		// what is actually purchasable either way.
		let clamped = quantity;
		if (quantity > 0) {
			const [variant] = await db
				.select({ trackInventory: productVariants.trackInventory })
				.from(productVariants)
				.where(eq(productVariants.id, variantId));
			if (variant?.trackInventory) {
				const available = await reservationService.getAvailableStock(variantId);
				clamped = clampToAvailable(quantity, available);
			}
		}

		const next = setQuantity(readLines(), variantId, clamped);
		writeLines(next);
		await syncCheckoutReservations(next);
		await getCart().refresh();
	}
);

export const removeCartLine = command(
	v.object({ variantId: variantIdSchema }),
	async ({ variantId }) => {
		const next = removeLine(readLines(), variantId);
		writeLines(next);
		await syncCheckoutReservations(next);
		await getCart().refresh();
	}
);
