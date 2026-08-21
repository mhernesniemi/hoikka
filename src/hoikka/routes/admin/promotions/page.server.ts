import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { promotionService } from "@hoikka/core/server/services/promotions";
import { fail } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
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

export const actions = {
	deleteSelected: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.delete(id)));
		return { success: true };
	},

	enableSelected: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.setEnabled(id, true)));
		return { success: true };
	},

	disableSelected: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No promotions selected" });
		}

		await Promise.all(ids.map((id) => promotionService.setEnabled(id, false)));
		return { success: true };
	}
};
