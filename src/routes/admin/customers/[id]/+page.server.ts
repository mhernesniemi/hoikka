/**
 * Admin Customer Detail Page Server
 */
import { dbError } from "$lib/server/db-error.js";
import { error, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { customerService } from "$lib/server/services/customers";
import { orderService } from "$lib/server/services/orders";

export const load: PageServerLoad = async ({ params }) => {
	const customerId = Number(params.id);
	if (!customerId) {
		throw error(404, "Customer not found");
	}

	const customer = await customerService.getById(customerId);
	if (!customer) {
		throw error(404, "Customer not found");
	}

	// Get customer orders
	const orders = await orderService.listForCustomer(customerId, {
		limit: 10,
		offset: 0
	});

	return {
		customer,
		orders
	};
};

export const actions: Actions = {
	updateVatId: async ({ params, request }) => {
		const customerId = Number(params.id);
		const formData = await request.formData();
		const vatId = formData.get("vatId")?.toString().trim() ?? "";

		try {
			await customerService.update(customerId, { vatId });
			return { success: true, message: "VAT ID updated" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update VAT ID") });
		}
	}
};
