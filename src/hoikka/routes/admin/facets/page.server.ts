import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { facetService } from "@hoikka/core/server/services/facets";
import { dbError } from "@hoikka/core/server/db-error";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
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

export const actions = {
	create: async ({ request }: RequestEvent) => {
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

	deleteSelected: async ({ request }: RequestEvent) => {
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
