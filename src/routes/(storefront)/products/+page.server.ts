import config from "$hoikka/config";
import { facetService } from "@hoikka/core/server/services/facets";
import { listProducts, parseListingParams } from "@hoikka/core/server/services/product-search";
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
