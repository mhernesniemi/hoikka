/**
 * Wishlist remote functions. The wishlist is a cookie (see
 * $lib/server/wishlist-cookie.ts) — toggling rewrites the cookie and
 * refreshes the count query in the same roundtrip.
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import {
	WISHLIST_COOKIE,
	WISHLIST_COOKIE_OPTIONS,
	parseWishlistCookie,
	serializeWishlistCookie,
	toggleId
} from "$lib/server/wishlist-cookie.js";

export const getWishlistCount = query(async () => {
	const { cookies } = getRequestEvent();
	return parseWishlistCookie(cookies.get(WISHLIST_COOKIE)).length;
});

export const toggleWishlist = command(
	v.object({ productId: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ productId }) => {
		const { cookies } = getRequestEvent();
		const { ids, added } = toggleId(
			parseWishlistCookie(cookies.get(WISHLIST_COOKIE)),
			productId
		);
		cookies.set(WISHLIST_COOKIE, serializeWishlistCookie(ids), WISHLIST_COOKIE_OPTIONS);
		await getWishlistCount().refresh();
		return { added };
	}
);
