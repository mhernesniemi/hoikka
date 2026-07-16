import { promotionService } from "$lib/server/services/promotions.js";
import { parseCartCookie, countItems, CART_COOKIE } from "$lib/server/cart-cookie.js";
import { parseWishlistCookie, WISHLIST_COOKIE } from "$lib/server/wishlist-cookie.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ cookies }) => {
	const activeDiscounts = await promotionService.getActiveProductDiscounts();

	// Cart and wishlist are cookies — counting them costs zero DB reads
	return {
		cartItemCount: countItems(parseCartCookie(cookies.get(CART_COOKIE))),
		wishlistCount: parseWishlistCookie(cookies.get(WISHLIST_COOKIE)).length,
		activeDiscounts
	};
};
