/**
 * Account layout server - protects all account routes
 * Requires user to be logged in
 */
import { redirect } from "@sveltejs/kit";
import { customerService } from "$lib/server/services/customers.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, "/sign-in?redirect=/account");
	}

	if (locals.user.emailVerified === false) {
		throw redirect(
			303,
			`/verify-email?email=${encodeURIComponent(locals.user.email)}&redirect=/account`
		);
	}

	// Create customer record if it doesn't exist (e.g. admin users)
	let customer = locals.customer;
	if (!customer) {
		customer = await customerService.create({
			authUserId: locals.user.id,
			email: locals.user.email,
			firstName: locals.user.name?.split(" ")[0] ?? "",
			lastName: locals.user.name?.split(" ").slice(1).join(" ") ?? ""
		});
		locals.customer = customer;
	}

	return {
		customer
	};
};
