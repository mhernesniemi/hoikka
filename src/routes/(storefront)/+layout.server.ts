import { wishlistService } from "$lib/server/services/wishlist.js";
import { orderService } from "$lib/server/services/orders.js";
import { productService } from "$lib/server/services/products.js";
import { promotionService } from "$lib/server/services/promotions.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
	const [wishlistCount, cart, searchCatalog, activeDiscounts] = await Promise.all([
		wishlistService.getCount({
			customerId: locals.customer?.id,
			guestToken: locals.wishlistToken
		}),
		orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		}),
		productService.getSearchCatalog(),
		promotionService.getActiveProductDiscounts()
	]);

	const cartItemCount = cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

	return {
		wishlistCount,
		cart,
		cartItemCount,
		searchCatalog,
		activeDiscounts
	};
};
