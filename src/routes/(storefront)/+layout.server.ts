import { wishlistService } from "$lib/server/services/wishlist.js";
import { getAllProductCards } from "$lib/server/services/product-search.js";
import { promotionService } from "$lib/server/services/promotions.js";
import { parseCartCookie, countItems, CART_COOKIE } from "$lib/server/cart-cookie.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const [wishlistCount, activeDiscounts] = await Promise.all([
		wishlistService.getCount({
			customerId: locals.customer?.id,
			guestToken: locals.wishlistToken
		}),
		promotionService.getActiveProductDiscounts()
	]);

	// The cart is a cookie — counting items costs zero DB reads
	const cartItemCount = countItems(parseCartCookie(cookies.get(CART_COOKIE)));

	return {
		wishlistCount,
		cartItemCount,
		cachedProducts: getAllProductCards(locals.customer?.id ?? null),
		activeDiscounts
	};
};
