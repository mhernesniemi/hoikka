/**
 * Wishlist remote functions. The wishlist is a cookie (see
 * $lib/server/wishlist-cookie.ts) — toggling rewrites the cookie and
 * refreshes the count query in the same roundtrip.
 */
import { getRequestEvent } from "$app/server";
import * as v from "valibot";
import {
	WISHLIST_COOKIE,
	WISHLIST_COOKIE_OPTIONS,
	parseWishlistCookie,
	serializeWishlistCookie,
	toggleId
} from "@hoikka/core/server/wishlist-cookie";

export const schemas = {
	toggleWishlist: v.object({ productId: v.pipe(v.number(), v.integer(), v.minValue(1)) })
};

export const getWishlistCount = async () => {
	const { cookies } = getRequestEvent();
	return parseWishlistCookie(cookies.get(WISHLIST_COOKIE)).length;
};

export const isProductWishlistedSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const isProductWishlisted = async (
	productId: v.InferOutput<typeof isProductWishlistedSchema>
) => {
	const { cookies } = getRequestEvent();
	return parseWishlistCookie(cookies.get(WISHLIST_COOKIE)).includes(productId);
};

/**
 * Command handlers. `refresh` re-runs the wishlist-count query after a mutation
 * (single-flight refresh) — the app wrapper passes `() => query().refresh()`.
 */
export function commands(refresh: () => Promise<void>) {
	return {
		toggleWishlist: async ({
			productId
		}: v.InferOutput<(typeof schemas)["toggleWishlist"]>) => {
			const { cookies } = getRequestEvent();
			const { ids, added } = toggleId(
				parseWishlistCookie(cookies.get(WISHLIST_COOKIE)),
				productId
			);
			cookies.set(WISHLIST_COOKIE, serializeWishlistCookie(ids), WISHLIST_COOKIE_OPTIONS);
			await refresh();
			return { added };
		}
	};
}

/**
 * Whether a product is wishlisted. Queried client-side so cached storefront
 * pages stay identical for every visitor (the cookie never touches SSR).
 */
