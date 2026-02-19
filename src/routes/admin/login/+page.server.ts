import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in as admin, redirect to admin
	if (locals.user && ["admin", "staff"].includes(locals.user.role ?? "")) {
		throw redirect(303, "/admin");
	}

	// If no admin user exists, redirect to setup
	const result = await db.execute<{ id: string }>(
		sql`SELECT id FROM neon_auth."user" WHERE role = 'admin' LIMIT 1`
	);
	if (result.rows.length === 0) {
		throw redirect(303, "/admin/setup");
	}

	return {};
};
