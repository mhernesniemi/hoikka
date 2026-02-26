import { parsePaginationParams } from "$lib/server/pagination.js";
import { promotionService } from "$lib/server/services/promotions.js";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await promotionService.list({
		search,
		limit,
		offset,
		sortBy,
		sortOrder
	});

	return {
		promotions: result.items,
		pagination: result.pagination,
		currentPage: page
	};
};

export const actions: Actions = {
	deleteSelected: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.delete(id)));
		return { success: true };
	},

	enableSelected: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.setEnabled(id, true)));
		return { success: true };
	},

	disableSelected: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.setEnabled(id, false)));
		return { success: true };
	}
};
