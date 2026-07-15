import { wishlistService } from "$lib/server/services/wishlist.js";
import { productService } from "$lib/server/services/products.js";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	// Get wishlist items (just IDs)
	const items = await wishlistService.getItems({
		customerId: locals.customer?.id,
		guestToken: locals.wishlistToken
	});

	// Load products using ProductService (view composition at route level)
	const products = await Promise.all(
		items.map(async (item) => {
			const product = await productService.getById(item.productId);
			return product ? { item, product } : null;
		})
	);

	// Filter out deleted products
	const wishlistProducts = products.filter((p) => p !== null);

	return { wishlistProducts };
};

export const actions: Actions = {
	remove: async ({ request, locals }) => {
		const formData = await request.formData();
		const productId = parseInt(formData.get("productId") as string);

		if (isNaN(productId)) {
			return fail(400, { error: "Invalid product ID" });
		}

		await wishlistService.removeItem({
			productId,
			customerId: locals.customer?.id,
			guestToken: locals.wishlistToken
		});

		return { success: true };
	},

	clear: async ({ locals }) => {
		await wishlistService.clear({
			customerId: locals.customer?.id,
			guestToken: locals.wishlistToken
		});

		return { success: true };
	}
};
