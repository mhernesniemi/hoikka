/**
 * Admin Customer Detail Page Server
 */
import config from "$hoikka/config";
import { formFields } from "$lib/fields/index.js";
import { sanitizeHtml } from "$lib/server/sanitize.js";
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

	const [orders, lastSignInAt] = await Promise.all([
		orderService.listForCustomer(customerId, { limit: 10, offset: 0 }),
		customerService.lastSignInAt(customer)
	]);

	return {
		customer,
		orders,
		lastSignInAt
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
	},

	updateFields: async ({ params, request }) => {
		const customerId = Number(params.id);
		const current = await customerService.getById(customerId);
		if (!current) return fail(404, { error: "Customer not found" });

		const parsed = formFields(
			config.customers.fields,
			await request.formData(),
			current.customFields,
			sanitizeHtml
		);
		if (!parsed.ok) return fail(400, { error: `Custom field ${parsed.error}` });

		try {
			await customerService.update(customerId, { customFields: parsed.values });
			return { success: true, message: "Details updated" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update details") });
		}
	}
};
