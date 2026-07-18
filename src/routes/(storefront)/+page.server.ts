import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const result = await productService.list({ visibility: "public", limit: 4 });
	await stampGroupPrices(result.items, locals.customer?.id ?? null);

	return { featuredProducts: result.items };
};
