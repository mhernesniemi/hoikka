import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { reviewService } from "@hoikka/core/server/services/reviews";
import { dbError } from "@hoikka/core/server/db-error";
import { fail } from "@sveltejs/kit";
import type { ReviewStatus } from "@hoikka/core/shared/types";

export const load = async ({ url }: ServerLoadEvent) => {
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

export const actions = {
	bulkApprove: async ({ request }: RequestEvent) => {
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

	bulkReject: async ({ request }: RequestEvent) => {
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

	bulkDelete: async ({ request }: RequestEvent) => {
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
