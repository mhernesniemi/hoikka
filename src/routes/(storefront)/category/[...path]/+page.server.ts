import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { categoryService } from "$lib/server/services/categories.js";
import { facetService } from "$lib/server/services/facets.js";

export const load: PageServerLoad = async ({ params }) => {
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

	return {
		category,
		breadcrumbs,
		children,
		productIds,
		facets: allFacets.filter((f) => !f.isPrivate)
	};
};
