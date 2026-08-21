import { productService } from "@hoikka/core/server/services/products";
import {
	WISHLIST_COOKIE,
	WISHLIST_COOKIE_OPTIONS,
	parseWishlistCookie,
	serializeWishlistCookie
} from "@hoikka/core/server/wishlist-cookie";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
	const ids = parseWishlistCookie(cookies.get(WISHLIST_COOKIE));

	const products = await Promise.all(
		ids.map(async (productId) => {
			const product = await productService.getById(productId);
			return product ? { item: { productId }, product } : null;
		})
	);

	// Filter out deleted products
	const wishlistProducts = products.filter((p) => p !== null);

	return { wishlistProducts };
};

export const actions: Actions = {
	remove: async ({ request, cookies }) => {
		const formData = await request.formData();
		const productId = parseInt(formData.get("productId") as string);

		if (isNaN(productId)) {
			return fail(400, { error: "Invalid product ID" });
		}

		const ids = parseWishlistCookie(cookies.get(WISHLIST_COOKIE)).filter(
			(id) => id !== productId
		);
		cookies.set(WISHLIST_COOKIE, serializeWishlistCookie(ids), WISHLIST_COOKIE_OPTIONS);

		return { success: true };
	},

	clear: async ({ cookies }) => {
		cookies.set(WISHLIST_COOKIE, serializeWishlistCookie([]), WISHLIST_COOKIE_OPTIONS);

		return { success: true };
	}
};
