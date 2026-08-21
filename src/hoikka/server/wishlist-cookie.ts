/**
 * Wishlist cookie codec. Same idea as the cart cookie: the wishlist is a
 * plain list of product ids in a cookie — no DB rows, no guest tokens, no
 * merge-on-login machinery. Format: JSON `[version, productId, ...]`.
 */
export const WISHLIST_COOKIE = "wishlist";

const WISHLIST_COOKIE_VERSION = 1;
const MAX_ITEMS = 100;

export const WISHLIST_COOKIE_OPTIONS = {
	path: "/",
	httpOnly: true,
	sameSite: "lax",
	maxAge: 60 * 60 * 24 * 365 // 1 year
} as const;

export function parseWishlistCookie(raw: string | undefined | null): number[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}

	if (!Array.isArray(parsed) || parsed[0] !== WISHLIST_COOKIE_VERSION) return [];

	const ids: number[] = [];
	const seen = new Set<number>();
	for (const id of parsed.slice(1)) {
		if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
		if (ids.length >= MAX_ITEMS) break;
	}
	return ids;
}

export function serializeWishlistCookie(ids: number[]): string {
	return JSON.stringify([WISHLIST_COOKIE_VERSION, ...ids]);
}

/** Toggle a product id; returns the new list and whether it was added. */
export function toggleId(ids: number[], productId: number): { ids: number[]; added: boolean } {
	if (ids.includes(productId)) {
		return { ids: ids.filter((id) => id !== productId), added: false };
	}
	return { ids: [...ids.slice(-(MAX_ITEMS - 1)), productId], added: true };
}
