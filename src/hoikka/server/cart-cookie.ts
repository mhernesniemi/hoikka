/**
 * Cart cookie codec.
 *
 * The cart lives entirely in a cookie while the customer shops — no DB rows
 * are written until checkout starts. Format: JSON `[version, [variantId, qty], ...]`,
 * e.g. `[1,[12,2],[34,1]]`. Compact enough that even a 50-line cart stays far
 * under the 4KB cookie limit.
 *
 * The cookie is intentionally unsigned: it only holds variant ids and
 * quantities, both of which a customer can set through the UI anyway. Prices
 * and stock are always resolved server-side when the cart is read.
 */

export interface CartLine {
	variantId: number;
	quantity: number;
}

export const CART_COOKIE = "cart";

const CART_COOKIE_VERSION = 1;
const MAX_LINES = 50;
const MAX_QUANTITY = 999;

export const CART_COOKIE_OPTIONS = {
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	maxAge: 60 * 60 * 24 * 30 // 30 days
} as const;

/**
 * Identifies the draft order created when checkout starts. Short-lived: the
 * draft is rebuilt from the cart cookie on every checkout entry anyway.
 */
export const CHECKOUT_COOKIE = "checkout_token";

export const CHECKOUT_COOKIE_OPTIONS = {
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	maxAge: 60 * 30 // 30 minutes
} as const;

/**
 * Receipt capability. The thank-you page shows a full order, so knowing an
 * order code must not be enough to read one — the browser that actually
 * completed the purchase gets the order's checkout token back in this cookie
 * and presents it to read that receipt. Logged-in customers are authorised by
 * ownership instead and never need it.
 *
 * A short ring of the most recent tokens, so buying twice does not lock the
 * shopper out of the earlier receipt.
 */
export const RECEIPT_COOKIE = "receipts";

const MAX_RECEIPTS = 5;

export const RECEIPT_COOKIE_OPTIONS = {
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	maxAge: 60 * 60 * 24 * 30 // 30 days
} as const;

export function parseReceiptCookie(raw: string | undefined | null): string[] {
	if (!raw) return [];
	return raw.split(".").filter((token) => /^[A-Za-z0-9_-]{16,64}$/.test(token));
}

export function addReceipt(existing: string[], token: string): string[] {
	return [token, ...existing.filter((t) => t !== token)].slice(0, MAX_RECEIPTS);
}

/** Hand the completing browser the capability to read this one receipt. */
export function grantReceipt(cookies: CookieJar | undefined, token: string | null): void {
	if (!cookies || !token) return;
	const next = addReceipt(parseReceiptCookie(cookies.get(RECEIPT_COOKIE)), token);
	cookies.set(RECEIPT_COOKIE, next.join("."), RECEIPT_COOKIE_OPTIONS);
}

/** The slice of SvelteKit's Cookies this module needs (keeps it testable). */
interface CookieJar {
	get(name: string): string | undefined;
	set(name: string, value: string, opts: { path: string }): void;
}

export function parseCartCookie(raw: string | undefined | null): CartLine[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}

	if (!Array.isArray(parsed) || parsed[0] !== CART_COOKIE_VERSION) return [];

	const lines: CartLine[] = [];
	const seen = new Set<number>();
	for (const entry of parsed.slice(1)) {
		if (!Array.isArray(entry) || entry.length !== 2) continue;
		const [variantId, quantity] = entry;
		if (!Number.isInteger(variantId) || variantId <= 0) continue;
		if (!Number.isInteger(quantity) || quantity <= 0) continue;
		if (seen.has(variantId)) continue;
		seen.add(variantId);
		lines.push({ variantId, quantity: Math.min(quantity, MAX_QUANTITY) });
		if (lines.length >= MAX_LINES) break;
	}
	return lines;
}

export function serializeCartCookie(lines: CartLine[]): string {
	return JSON.stringify([
		CART_COOKIE_VERSION,
		...lines.map((l) => [l.variantId, l.quantity] as const)
	]);
}

export function addLine(lines: CartLine[], variantId: number, quantity: number): CartLine[] {
	if (quantity <= 0) return lines;
	const existing = lines.find((l) => l.variantId === variantId);
	if (existing) {
		return setQuantity(lines, variantId, existing.quantity + quantity);
	}
	if (lines.length >= MAX_LINES) {
		throw new Error(`Cart is limited to ${MAX_LINES} different items`);
	}
	return [...lines, { variantId, quantity: Math.min(quantity, MAX_QUANTITY) }];
}

export function setQuantity(lines: CartLine[], variantId: number, quantity: number): CartLine[] {
	if (quantity <= 0) return removeLine(lines, variantId);
	return lines.map((l) =>
		l.variantId === variantId ? { ...l, quantity: Math.min(quantity, MAX_QUANTITY) } : l
	);
}

export function removeLine(lines: CartLine[], variantId: number): CartLine[] {
	return lines.filter((l) => l.variantId !== variantId);
}

export function countItems(lines: CartLine[]): number {
	return lines.reduce((sum, l) => sum + l.quantity, 0);
}
