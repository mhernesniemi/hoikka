/**
 * Admin Customer Detail Page Server
 */
import { dbError } from "@hoikka/core/server/db-error";
import { error, fail } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { customerService } from "@hoikka/core/server/services/customers";
import { orderService } from "@hoikka/core/server/services/orders";

export const load = async ({ params }: ServerLoadEvent) => {
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

export const actions = {
	updateVatId: async ({ params, request }: RequestEvent) => {
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
