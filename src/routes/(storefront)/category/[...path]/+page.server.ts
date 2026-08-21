import config from "$hoikka/config";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { categoryService } from "@hoikka/core/server/services/categories";
import { facetService } from "@hoikka/core/server/services/facets";
import { listProducts, parseListingParams } from "@hoikka/core/server/services/product-search";

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const pathSegments = params.path.split("/").filter(Boolean);
	const currentSlug = pathSegments[pathSegments.length - 1];

	if (!currentSlug) {
		throw error(404, "Category not found");
	}

	const category = await categoryService.getBySlug(currentSlug);
	if (!category) {
		throw error(404, "Category not found");
	}

	// Verify the path is correct by checking breadcrumbs
	const breadcrumbs = await categoryService.getBreadcrumbs(category.id);
	const expectedPath = breadcrumbs.map((b) => b.slug).join("/");

	if (params.path !== expectedPath) {
		throw error(404, "Category not found");
	}

	const [children, productIds, allFacets] = await Promise.all([
		categoryService.getChildren(category.id),
		categoryService.getAllProductIds(category.id),
		facetService.list()
	]);

	const listing = await listProducts({
		limit: config.limits.pageSize.storefront,
		...parseListingParams(url),
		productIds,
		customerId: locals.customer?.id ?? null
	});

	return {
		category,
		breadcrumbs,
		children,
		listing,
		facets: allFacets.filter((f) => !f.isHidden)
	};
};
