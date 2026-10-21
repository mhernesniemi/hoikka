import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";
import config from "$hoikka/config";
import { formFields } from "$lib/fields/index.js";
import { sanitizeHtml } from "$lib/server/sanitize.js";
import { customerService } from "$lib/server/services/customers.js";

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		const customer = locals.customer;
		if (!customer) {
			return fail(401, { error: "Not authenticated" });
		}

		const formData = await request.formData();
		const firstName = formData.get("firstName")?.toString().trim();
		const lastName = formData.get("lastName")?.toString().trim();
		const phone = formData.get("phone")?.toString().trim() || undefined;
		const vatId = formData.get("vatId")?.toString().trim() ?? "";

		if (!firstName || !lastName) {
			return fail(400, { error: "First name and last name are required" });
		}

		const fields = config.customers.fields;
		const parsedFields = formFields(
			fields,
			formData,
			customer.customFields,
			sanitizeHtml,
			(def) => def.storefront === "edit"
		);
		if (!parsedFields.ok) {
			const label = fields.find((def) => parsedFields.error.startsWith(`${def.key}:`))?.label;
			return fail(400, { error: `Check ${label ?? "your details"}` });
		}

		try {
			const updatedCustomer = await customerService.update(customer.id, {
				firstName,
				lastName,
				phone,
				vatId,
				...(fields.length > 0 && { customFields: parsedFields.values })
			});

			return { success: true, customer: updatedCustomer };
		} catch (e) {
			console.error("Failed to update profile:", e);
			return fail(500, { error: "Failed to update profile" });
		}
	}
};
