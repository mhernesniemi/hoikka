import type { PageServerLoad, Actions } from "./$types";
import { parsePaginationParams } from "$lib/server/pagination.js";
import { reviewService } from "$lib/server/services/reviews.js";
import { dbError } from "$lib/server/db-error.js";
import { fail } from "@sveltejs/kit";
import type { ReviewStatus } from "$lib/types.js";

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get("status") as ReviewStatus | null;
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await reviewService.list({
		status: status ?? undefined,
		limit,
		offset,
		search,
		sortBy,
		sortOrder
	});

	return {
		reviews: result.items,
		pagination: result.pagination,
		currentStatus: status,
		currentPage: page
	};
};

export const actions: Actions = {
	bulkApprove: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No reviews selected" });
		}

		try {
			await Promise.all(ids.map((id) => reviewService.moderate(id, "approved")));
			return {
				success: true,
				message: `${ids.length} review${ids.length !== 1 ? "s" : ""} approved`
			};
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to approve reviews") });
		}
	},

	bulkReject: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No reviews selected" });
		}

		try {
			await Promise.all(ids.map((id) => reviewService.moderate(id, "rejected")));
			return {
				success: true,
				message: `${ids.length} review${ids.length !== 1 ? "s" : ""} rejected`
			};
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to reject reviews") });
		}
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No reviews selected" });
		}

		try {
			await Promise.all(ids.map((id) => reviewService.delete(id)));
			return {
				success: true,
				message: `${ids.length} review${ids.length !== 1 ? "s" : ""} deleted`
			};
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete reviews") });
		}
	}
};
