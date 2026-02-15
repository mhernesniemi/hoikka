import { customerGroupService } from "$lib/server/services/customerGroups.js";
import { customerService } from "$lib/server/services/customers.js";
import { dbError } from "$lib/server/db-error.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid group ID");
	}

	const group = await customerGroupService.getById(id);
	if (!group) {
		throw error(404, "Customer group not found");
	}

	const [groupCustomers, allCustomers] = await Promise.all([
		customerGroupService.getCustomers(id),
		customerService.list(1000, 0)
	]);

	return {
		group,
		groupCustomers,
		allCustomers: allCustomers.items
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const isTaxExempt = formData.get("isTaxExempt") === "true";
		const customerIds = formData.getAll("customerIds").map(Number).filter(Boolean);

		if (!name) {
			return fail(400, { error: "Name is required" });
		}

		try {
			await customerGroupService.update(id, {
				name,
				description: description || undefined,
				isTaxExempt
			});
			await customerGroupService.setCustomers(id, customerIds);
			return { success: true, message: "Group updated" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update group") });
		}
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		try {
			await customerGroupService.delete(id);
			throw redirect(303, "/admin/customers?tab=groups");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete group") });
		}
	}
};
