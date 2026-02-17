/**
 * Admin layout server - protects all admin routes
 * Uses Neon Auth with role-based access
 */
import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Skip auth for login page
	if (url.pathname === "/admin/login") {
		return { adminUser: null, adminDark: locals.adminDark };
	}

	// Check if user has admin or staff role
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw redirect(303, "/admin/login");
	}

	return {
		adminUser: locals.user,
		adminDark: locals.adminDark
	};
};
