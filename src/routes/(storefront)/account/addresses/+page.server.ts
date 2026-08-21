/**
 * Account Addresses Page Server
 * Handles address CRUD operations
 */
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { customerService } from "@hoikka/core/server/services/customers";

export const load: PageServerLoad = async ({ parent }) => {
	const { customer } = await parent();

	if (!customer) {
		return { addresses: [] };
	}

	const customerWithAddresses = await customerService.getById(customer.id);

	return {
		addresses: customerWithAddresses?.addresses ?? []
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const customer = locals.customer;
		if (!customer) {
			return fail(401, { error: "Not authenticated" });
		}

		const formData = await request.formData();
		const fullName = formData.get("fullName") as string;
		const company = formData.get("company") as string;
		const streetLine1 = formData.get("streetLine1") as string;
		const streetLine2 = formData.get("streetLine2") as string;
		const city = formData.get("city") as string;
		const postalCode = formData.get("postalCode") as string;
		const country = formData.get("country") as string;
		const phoneNumber = formData.get("phoneNumber") as string;
		const isDefault = formData.get("isDefault") === "on";

		if (!streetLine1 || !city || !postalCode || !country) {
			return fail(400, { error: "Street, city, postal code, and country are required" });
		}

		await customerService.addAddress(customer.id, {
			fullName: fullName || undefined,
			company: company || undefined,
			streetLine1,
			streetLine2: streetLine2 || undefined,
			city,
			postalCode,
			country,
			phoneNumber: phoneNumber || undefined,
			isDefault
		});

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const customer = locals.customer;
		if (!customer) {
			return fail(401, { error: "Not authenticated" });
		}

		const formData = await request.formData();
		const addressId = Number(formData.get("addressId"));
		const fullName = formData.get("fullName") as string;
		const company = formData.get("company") as string;
		const streetLine1 = formData.get("streetLine1") as string;
		const streetLine2 = formData.get("streetLine2") as string;
		const city = formData.get("city") as string;
		const postalCode = formData.get("postalCode") as string;
		const country = formData.get("country") as string;
		const phoneNumber = formData.get("phoneNumber") as string;
		const isDefault = formData.get("isDefault") === "on";

		if (!addressId || !streetLine1 || !city || !postalCode || !country) {
			return fail(400, { error: "Invalid address data" });
		}

		// Verify address belongs to customer
		const customerWithAddresses = await customerService.getById(customer.id);
		const addressBelongsToCustomer = customerWithAddresses?.addresses.some(
			(a) => a.id === addressId
		);

		if (!addressBelongsToCustomer) {
			return fail(403, { error: "Address not found" });
		}

		await customerService.updateAddress(addressId, {
			fullName: fullName || undefined,
			company: company || undefined,
			streetLine1,
			streetLine2: streetLine2 || undefined,
			city,
			postalCode,
			country,
			phoneNumber: phoneNumber || undefined,
			isDefault
		});

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const customer = locals.customer;
		if (!customer) {
			return fail(401, { error: "Not authenticated" });
		}

		const formData = await request.formData();
		const addressId = Number(formData.get("addressId"));

		if (!addressId) {
			return fail(400, { error: "Address ID required" });
		}

		// Verify address belongs to customer
		const customerWithAddresses = await customerService.getById(customer.id);
		const addressBelongsToCustomer = customerWithAddresses?.addresses.some(
			(a) => a.id === addressId
		);

		if (!addressBelongsToCustomer) {
			return fail(403, { error: "Address not found" });
		}

		await customerService.deleteAddress(addressId);

		return { success: true };
	},

	setDefault: async ({ request, locals }) => {
		const customer = locals.customer;
		if (!customer) {
			return fail(401, { error: "Not authenticated" });
		}

		const formData = await request.formData();
		const addressId = Number(formData.get("addressId"));

		if (!addressId) {
			return fail(400, { error: "Address ID required" });
		}

		// Verify address belongs to customer
		const customerWithAddresses = await customerService.getById(customer.id);
		const addressBelongsToCustomer = customerWithAddresses?.addresses.some(
			(a) => a.id === addressId
		);

		if (!addressBelongsToCustomer) {
			return fail(403, { error: "Address not found" });
		}

		await customerService.updateAddress(addressId, { isDefault: true });

		return { success: true };
	}
};
