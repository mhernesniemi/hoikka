import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import { facetService } from "$lib/server/services/facets.js";
import type { PageServerLoad } from "./$types";
import type { FacetCount, FacetWithValues } from "$lib/types.js";

export const load: PageServerLoad = async ({ url, locals }) => {
	const search = url.searchParams.get("q") ?? undefined;
	const page = Number(url.searchParams.get("page")) || 1;
	const limit = 12;
	const offset = (page - 1) * limit;

	// Parse facet filters from URL
	const facetFilters: Record<string, string[]> = {};
	for (const [key, value] of url.searchParams.entries()) {
		if (key.startsWith("facet_")) {
			const facetCode = key.replace("facet_", "");
			if (!facetFilters[facetCode]) {
				facetFilters[facetCode] = [];
			}
			facetFilters[facetCode].push(value);
		}
	}

	// Fetch products with filters (public only)
	const result = await productService.list({
		visibility: "public",
		facets: Object.keys(facetFilters).length > 0 ? facetFilters : undefined,
		search,
		limit,
		offset
	});

	// Fetch all facets for filter sidebar
	const facets = await facetService.list();

	// Get facet counts for currently visible products
	const facetCounts: Record<string, { code: string; name: string; count: number }[]> = {};
	for (const facet of facets) {
		if (!facet.isPrivate) {
			const counts = await productService.getFacetCounts(facet.code, facetFilters);
			facetCounts[facet.code] = counts.map((c: FacetCount) => ({
				code: c.valueCode,
				name: c.valueName,
				count: c.count
			}));
		}
	}

	await stampGroupPrices(result.items, locals.customer?.id ?? null);

	return {
		products: result.items,
		pagination: result.pagination,
		currentPage: page,
		facets: facets.filter((f: FacetWithValues) => !f.isPrivate),
		facetCounts,
		activeFilters: facetFilters,
		search
	};
};
