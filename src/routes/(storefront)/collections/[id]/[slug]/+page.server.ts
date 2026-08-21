import config from "$hoikka/config";
import type { PageServerLoad } from "./$types";
import { collectionService } from "@hoikka/core/server/services/collections";
import { facetService } from "@hoikka/core/server/services/facets";
import { listProducts, parseListingParams } from "@hoikka/core/server/services/product-search";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Collection not found");
	}

	const isPreview = !!locals.user && ["admin", "staff"].includes(locals.user.role ?? "");

	const collection = await collectionService.getById(id);
	if (!collection || (!isPreview && collection.isPrivate)) {
		throw error(404, "Collection not found");
	}

	// Redirect if slug doesn't match (for SEO and correct URLs)
	if (collection.slug && params.slug !== collection.slug) {
		throw redirect(301, `/collections/${id}/${collection.slug}`);
	}

	const [productIds, allFacets] = await Promise.all([
		collectionService.getProductIdsForCollection(collection.id),
		facetService.list()
	]);

	const listing = await listProducts({
		limit: config.limits.pageSize.storefront,
		...parseListingParams(url),
		productIds,
		customerId: locals.customer?.id ?? null
	});

	return {
		collection,
		listing,
		facets: allFacets.filter((f) => !f.isHidden)
	};
};
