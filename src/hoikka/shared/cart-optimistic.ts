/**
 * Optimistic cart math for `getCart().withOverride(...)` — the UI applies
 * these in the same frame as the click, then the command's single-flight
 * refresh replaces the override with the server-computed cart (or rolls it
 * back on error).
 *
 * Deliberately structural only: lines, quantities and counts change here;
 * cart-level money (subtotal/discount/VAT/total) stays untouched because
 * promotions and tax are server rules — the footer shows the last
 * authoritative values, dimmed, until the refresh lands. Line totals are the
 * exception: unitPrice × qty is exact.
 */
import type { CartView, CartViewLine } from "@hoikka/core/server/services/cart";

/** What the client knows about a product when optimistically adding it */
export interface OptimisticLineSeed {
	variantId: number;
	productId: number;
	productName: string;
	variantName: string | null;
	imageUrl: string | null;
	unitPrice: number;
}

export function withQuantity(cart: CartView, variantId: number, quantity: number): CartView {
	const lines =
		quantity <= 0
			? cart.lines.filter((l) => l.variantId !== variantId)
			: cart.lines.map((l) =>
					l.variantId === variantId
						? { ...l, quantity, lineTotal: l.unitPrice * quantity }
						: l
				);
	return { ...cart, lines, itemCount: countItems(lines) };
}

export function withAddedLine(
	cart: CartView,
	seed: OptimisticLineSeed,
	quantity: number
): CartView {
	const existing = cart.lines.find((l) => l.variantId === seed.variantId);
	const lines = existing
		? cart.lines.map((l) =>
				l.variantId === seed.variantId
					? {
							...l,
							quantity: l.quantity + quantity,
							lineTotal: l.unitPrice * (l.quantity + quantity)
						}
					: l
			)
		: [...cart.lines, syntheticLine(seed, quantity)];
	return { ...cart, lines, itemCount: countItems(lines) };
}

/** Placeholder tax/stock fields are never rendered by the sheet and are
 *  replaced wholesale by the refreshed server cart moments later */
function syntheticLine(seed: OptimisticLineSeed, quantity: number): CartViewLine {
	return {
		...seed,
		sku: "",
		quantity,
		lineTotal: seed.unitPrice * quantity,
		taxAmount: 0,
		taxCode: "standard",
		taxRate: 0,
		unitPriceNet: seed.unitPrice,
		lineTotalNet: seed.unitPrice * quantity,
		available: null,
		outOfStock: false
	};
}

function countItems(lines: CartViewLine[]): number {
	return lines.reduce((sum, l) => sum + l.quantity, 0);
}
