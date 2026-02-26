import type { PageServerLoad, Actions } from "./$types";
import { parsePaginationParams } from "$lib/server/pagination.js";
import { collectionService } from "$lib/server/services/collections.js";
import { dbError } from "$lib/server/db-error.js";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "$lib/utils.js";

export const load: PageServerLoad = async ({ url }) => {
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await collectionService.listPaginated({
		limit,
		offset,
		search,
		sortBy,
		sortOrder
	});

	return {
		collections: result.items,
		pagination: result.pagination,
		currentPage: page
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name") as string;
		const slug = data.get("slug") as string;

		if (!name || !slug) {
			return fail(400, { error: "Name and slug are required" });
		}

		try {
			const collection = await collectionService.create({
				isPrivate: false,
				name,
				slug: slugify(slug)
			});

			throw redirect(303, `/admin/collections/${collection.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create collection") });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get("id"));

		if (!id) {
			return fail(400, { error: "Collection ID is required" });
		}

		const success = await collectionService.delete(id);
		if (!success) {
			return fail(404, { error: "Collection not found" });
		}

		return { success: true };
	},

	deleteSelected: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No collections selected" });
		}

		try {
			await Promise.all(ids.map((id) => collectionService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete collections") });
		}
	}
};
