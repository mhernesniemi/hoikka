import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { contentPageService } from "@hoikka/core/server/services/content-pages";
import { dbError } from "@hoikka/core/server/db-error";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "@hoikka/core/shared/utils";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await contentPageService.listPaginated({
		limit,
		offset,
		search,
		sortBy,
		sortOrder
	});

	return {
		pages: result.items,
		pagination: result.pagination,
		currentPage: page
	};
};

export const actions = {
	createPage: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const name = formData.get("name") as string;
		const slug = formData.get("slug") as string;

		if (!name) {
			return fail(400, { error: "Title is required" });
		}

		try {
			const page = await contentPageService.create({
				title: name,
				slug: slugify(slug || name),
				published: false
			});
			throw redirect(303, `/admin/content-pages/${page.id}?created=1`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create page") });
		}
	},

	publish: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No pages selected" });
		}

		try {
			await Promise.all(ids.map((id) => contentPageService.update(id, { published: true })));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to publish pages") });
		}
	},

	deleteSelected: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No pages selected" });
		}

		try {
			await Promise.all(ids.map((id) => contentPageService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete pages") });
		}
	}
};
