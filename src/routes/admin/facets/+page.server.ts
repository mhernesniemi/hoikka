import { parsePaginationParams } from "$lib/server/pagination.js";
import { facetService } from "$lib/server/services/facets.js";
import { dbError } from "$lib/server/db-error.js";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await facetService.listPaginated({
		limit,
		offset,
		search,
		sortBy,
		sortOrder
	});

	return {
		facets: result.items,
		pagination: result.pagination,
		currentPage: page
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const code = formData.get("code") as string;
		const name = formData.get("name") as string;

		if (!code || !name) {
			return fail(400, { error: "Code and name are required" });
		}

		try {
			const facet = await facetService.create({
				code: code.toLowerCase().replace(/\s+/g, "_"),
				name: name
			});

			throw redirect(303, `/admin/facets/${facet.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create facet") });
		}
	},

	deleteSelected: async ({ request }) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No facets selected" });
		}

		try {
			await Promise.all(ids.map((id) => facetService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete facets") });
		}
	}
};
