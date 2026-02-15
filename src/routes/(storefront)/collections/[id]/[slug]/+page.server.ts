import type { PageServerLoad } from "./$types";
import { collectionService } from "$lib/server/services/collections.js";
import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Collection not found");
	}

	const isPreview = url.searchParams.has("preview") && !!locals.adminUser;
	const page = parseInt(url.searchParams.get("page") ?? "1");
	const limit = 12;
	const offset = (page - 1) * limit;

	const collection = await collectionService.getById(id);
	if (!collection || (!isPreview && collection.isPrivate)) {
		throw error(404, "Collection not found");
	}

	// Redirect if slug doesn't match (for SEO and correct URLs)
	if (collection.slug && params.slug !== collection.slug) {
		const pageParam = page > 1 ? `?page=${page}` : "";
		throw redirect(301, `/collections/${id}/${collection.slug}${pageParam}`);
	}

	const { items: products, pagination } = await collectionService.getProductsForCollection(
		collection.id,
		{ limit, offset }
	);

	await stampGroupPrices(products, locals.customer?.id ?? null);

	return {
		collection,
		products,
		pagination: {
			...pagination,
			currentPage: page,
			totalPages: Math.ceil(pagination.total / limit)
		}
	};
};
