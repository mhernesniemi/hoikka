import { customerService } from "$lib/server/services/customers.js";
import { customerGroupService } from "$lib/server/services/customerGroups.js";
import { dbError } from "$lib/server/db-error.js";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async () => {
	const [customerResult, groups] = await Promise.all([
		customerService.list(1000, 0),
		customerGroupService.list()
	]);

	return {
		customers: customerResult.items,
		groups
	};
};

export const actions: Actions = {
	deleteSelected: async ({ request }) => {
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

	createGroup: async ({ request }) => {
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

	deleteSelectedGroups: async ({ request }) => {
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
