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
 * Keep an active checkout draft in lockstep with the cookie. Cart mutations
 * refresh the cart query before calling this function so the shopper's newly
 * rebuilt reservations cannot make their own cart appear out of stock.
 */
async function syncCheckoutDraft(lines: CartLine[]): Promise<void> {
	const { cookies, locals } = getRequestEvent();
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

	const { resolvedCartLines } = await orderService.startCheckout(lines, {
		customerId: locals.customer?.id,
		checkoutToken: token
	});
	if (serializeCartCookie(resolvedCartLines) !== serializeCartCookie(lines)) {
		writeLines(resolvedCartLines);
	}
}

async function getActiveCheckoutDraft() {
	const { cookies } = getRequestEvent();
	return orderService.getDraftByToken(cookies.get(CHECKOUT_COOKIE));
}

async function getAvailableStock(variantId: number): Promise<number> {
	const draft = await getActiveCheckoutDraft();
	return draft
		? reservationService.getAvailableStockExcludingOrder(variantId, draft.id)
		: reservationService.getAvailableStock(variantId);
}

export const getCart = query(async () => {
	const { locals } = getRequestEvent();
	const draft = await getActiveCheckoutDraft();
	return getCartView(readLines(), locals.customer?.id ?? null, {
		excludeReservationOrderId: draft?.id
	});
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
			const available = await getAvailableStock(variantId);
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

		const next = addLine(lines, variantId, quantity);
		writeLines(next);
		await getCart().refresh();
		await syncCheckoutDraft(next);
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
				const available = await getAvailableStock(variantId);
				clamped = clampToAvailable(quantity, available);
			}
		}

		const next = setQuantity(readLines(), variantId, clamped);
		writeLines(next);
		await getCart().refresh();
		await syncCheckoutDraft(next);
	}
);

export const removeCartLine = command(
	v.object({ variantId: variantIdSchema }),
	async ({ variantId }) => {
		const next = removeLine(readLines(), variantId);
		writeLines(next);
		await getCart().refresh();
		await syncCheckoutDraft(next);
	}
);
