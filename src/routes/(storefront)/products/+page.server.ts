import { facetService } from "$lib/server/services/facets.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const allFacets = await facetService.list();

	return {
		facets: allFacets.filter((f) => !f.isPrivate)
	};
};
