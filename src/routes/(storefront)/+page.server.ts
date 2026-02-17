import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	// Get featured products (public only, limited to 2 for demo layout)
	const result = await productService.list({
		visibility: "public",
		limit: 2
	});

	await stampGroupPrices(result.items, locals.customer?.id ?? null);

	return {
		featuredProducts: result.items
	};
};
