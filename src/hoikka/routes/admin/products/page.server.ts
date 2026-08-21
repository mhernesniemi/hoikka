import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { productService } from "@hoikka/core/server/services/products";
import { reindexProduct, removeFromIndex } from "@hoikka/core/server/services/product-search";
import { dbError } from "@hoikka/core/server/db-error";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await productService.listSummary({
		search,
		limit,
		offset,
		visibility: ["public", "private", "draft"],
		sortBy,
		sortOrder
	});

	return {
		products: result.items,
		pagination: result.pagination,
		currentPage: page
	};
};

export const actions = {
	create: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const name = formData.get("name") as string;
		const slug = formData.get("slug") as string;

		if (!name || !slug) {
			return fail(400, { error: "Name and slug are required" });
		}

		try {
			const product = await productService.create({
				type: "physical",
				visibility: "draft",
				name,
				slug
			});

			await reindexProduct(product.id);

			throw redirect(303, `/admin/products/${product.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create product") });
		}
	},

	publish: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No products selected" });
		}

		try {
			await Promise.all(ids.map((id) => productService.update(id, { visibility: "public" })));
			await Promise.all(ids.map((id) => reindexProduct(id)));
			return {
				success: true,
				message: `${ids.length} product${ids.length !== 1 ? "s" : ""} published`
			};
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to publish products") });
		}
	},

	deleteSelected: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No products selected" });
		}

		try {
			await Promise.all(ids.map((id) => productService.delete(id)));
			await Promise.all(ids.map((id) => removeFromIndex(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete products") });
		}
	}
};
