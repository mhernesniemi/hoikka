import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db/index.js";
import { user } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user && ["admin", "staff"].includes(locals.user.role ?? "")) {
		throw redirect(303, "/admin");
	}

	const admin = await db.query.user.findFirst({
		where: eq(user.role, "admin"),
		columns: { id: true }
	});

	if (!admin) {
		throw redirect(303, "/admin/setup");
	}

	return {};
};
