import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in as admin, redirect to admin
	if (locals.user && ["admin", "staff"].includes(locals.user.role ?? "")) {
		throw redirect(303, "/admin");
	}
	return {};
};
