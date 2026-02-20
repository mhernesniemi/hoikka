import type { PageServerLoad } from "./$types";
import { collectionService } from "$lib/server/services/collections.js";
import { facetService } from "$lib/server/services/facets.js";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, locals }) => {
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

	return {
		collection,
		productIds,
		facets: allFacets.filter((f) => !f.isHidden)
	};
};
