import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { customerService } from "@hoikka/core/server/services/customers";
import { customerGroupService } from "@hoikka/core/server/services/customerGroups";
import { dbError } from "@hoikka/core/server/db-error";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
	const tab = url.searchParams.get("tab") ?? "customers";
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	if (tab === "groups") {
		const [customerResult, groupResult] = await Promise.all([
			customerService.list({ limit: 0 }),
			customerGroupService.listPaginated({
				limit,
				offset,
				search,
				sortBy,
				sortOrder
			})
		]);

		return {
			customers: customerResult.items,
			groups: groupResult.items,
			customerPagination: customerResult.pagination,
			groupPagination: groupResult.pagination,
			currentPage: page,
			tab
		};
	}

	const [customerResult, groupResult] = await Promise.all([
		customerService.list({
			limit,
			offset,
			search,
			sortBy,
			sortOrder
		}),
		customerGroupService.listPaginated({ limit: 0 })
	]);

	return {
		customers: customerResult.items,
		groups: groupResult.items,
		customerPagination: customerResult.pagination,
		groupPagination: groupResult.pagination,
		currentPage: page,
		tab
	};
};

export const actions = {
	deleteSelected: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No customers selected" });
		}

		try {
			await Promise.all(ids.map((id) => customerService.delete(id)));
			return { success: true, message: "Customers deleted" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete customers") });
		}
	},

	createGroup: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const name = formData.get("name") as string;

		if (!name) {
			return fail(400, { error: "Name is required" });
		}

		try {
			const group = await customerGroupService.create({ name });
			throw redirect(303, `/admin/customers/groups/${group.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create group") });
		}
	},

	deleteSelectedGroups: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const ids = data.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No groups selected" });
		}

		try {
			await Promise.all(ids.map((id) => customerGroupService.delete(id)));
			return { success: true, message: "Groups deleted" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete groups") });
		}
	}
};
