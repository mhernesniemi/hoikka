import { listProducts } from "#lib/server/services/product-search.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const { items } = await listProducts({ limit: 4, customerId: locals.customer?.id ?? null });

	return { featuredProducts: items };
};
