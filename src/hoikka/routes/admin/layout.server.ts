/**
 * Admin layout server - protects all admin routes
 * Role-based access via Better Auth (staff/admin only)
 */
import { redirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ locals, url }: ServerLoadEvent) => {
	// Skip auth for login and setup pages
	if (url.pathname === "/admin/login" || url.pathname === "/admin/setup") {
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
