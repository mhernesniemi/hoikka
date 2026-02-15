import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { categoryService } from "$lib/server/services/categories.js";
import { productService, stampGroupPrices } from "$lib/server/services/products.js";

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const pathSegments = params.path.split("/").filter(Boolean);
	const currentSlug = pathSegments[pathSegments.length - 1];

	if (!currentSlug) {
		throw error(404, "Category not found");
	}

	// Get the current category
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

	// Get children for navigation
	const children = await categoryService.getChildren(category.id);

	// Get products in this category (and subcategories)
	const page = Number(url.searchParams.get("page")) || 1;
	const limit = 12;
	const offset = (page - 1) * limit;

	const { products: productIds, total } = await categoryService.getProducts(category.id, {
		limit,
		offset
	});

	// Fetch full product data
	const products = await Promise.all(productIds.map((id) => productService.getById(id))).then(
		(results) => results.filter(Boolean)
	);

	await stampGroupPrices(
		products.filter(Boolean) as NonNullable<(typeof products)[0]>[],
		locals.customer?.id ?? null
	);

	return {
		category,
		breadcrumbs,
		children,
		products,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		}
	};
};
