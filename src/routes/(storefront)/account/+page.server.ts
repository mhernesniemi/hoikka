import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { customerService } from "@hoikka/core/server/services/customers";

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

		try {
			const updatedCustomer = await customerService.update(customer.id, {
				firstName,
				lastName,
				phone,
				vatId
			});

			return { success: true, customer: updatedCustomer };
		} catch (e) {
			console.error("Failed to update profile:", e);
			return fail(500, { error: "Failed to update profile" });
		}
	}
};
