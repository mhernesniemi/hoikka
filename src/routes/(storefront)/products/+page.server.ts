import config from "$hoikka/config";
import { facetService } from "$lib/server/services/facets.js";
import { listProducts, parseListingParams } from "$lib/server/services/product-search.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
	const [allFacets, listing] = await Promise.all([
		facetService.list(),
		listProducts({
			limit: config.limits.pageSize.storefront,
			...parseListingParams(url),
			customerId: locals.customer?.id ?? null
		})
	]);

	return {
		facets: allFacets.filter((f) => !f.isHidden),
		listing
	};
};
