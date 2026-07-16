import { productService } from "$lib/server/services/products.js";
import { loadProductPageData } from "$lib/server/services/product-page.js";
import { reviewService } from "$lib/server/services/reviews.js";
import { taxService } from "$lib/server/services/tax.js";
import { error, fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Product not found");
	}

	const isPreview =
		url.searchParams.has("preview") &&
		!!locals.user &&
		["admin", "staff"].includes(locals.user.role ?? "");

	const { product, rating, reviewsResult, customerReview, breadcrumbs, relatedProducts } =
		await loadProductPageData(id, locals.customer?.id ?? null);

	if (!product || (!isPreview && product.visibility === "draft")) {
		throw error(404, "Product not found");
	}

	// Private products require membership in a tax-exempt group
	if (!isPreview && product.visibility === "private") {
		const isTaxExempt = await taxService.isCustomerTaxExempt(locals.customer?.id);
		if (!isTaxExempt) {
			throw error(404, "Product not found");
		}
	}

	// Redirect if slug doesn't match (for SEO and correct URLs)
	if (product.slug && params.slug !== product.slug) {
		throw redirect(301, `/products/${id}/${product.slug}`);
	}

	// isWishlisted intentionally isn't loaded here: guest pages are
	// edge-cached, so cookie state hydrates via a remote query instead
	return {
		product,
		rating,
		reviews: reviewsResult.items,
		reviewsPagination: reviewsResult.pagination,
		customerReview,
		customerId: locals.customer?.id ?? null,
		isAdmin: !!locals.user && ["admin", "staff"].includes(locals.user.role ?? ""),
		breadcrumbs,
		relatedProducts
	};
};

export const actions: Actions = {
	submitReview: async ({ request, locals, params }) => {
		if (!locals.customer) {
			return fail(401, { reviewError: "You must be logged in to submit a review" });
		}

		const id = Number(params.id);
		if (isNaN(id)) {
			return fail(404, { reviewError: "Product not found" });
		}

		const product = await productService.getById(id);
		if (!product) {
			return fail(404, { reviewError: "Product not found" });
		}

		const data = await request.formData();
		const nickname = (data.get("nickname") as string)?.trim();
		const rating = Number(data.get("rating"));
		const comment = data.get("comment") as string;

		if (!nickname) {
			return fail(400, { reviewError: "Please enter a nickname" });
		}

		if (!rating || rating < 1 || rating > 5) {
			return fail(400, { reviewError: "Please select a rating between 1 and 5" });
		}

		try {
			await reviewService.create({
				productId: product.id,
				customerId: locals.customer.id,
				nickname,
				rating,
				comment: comment || undefined
			});
			return { reviewSuccess: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to submit review";
			return fail(400, { reviewError: message });
		}
	}
};
