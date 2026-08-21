import { redirect } from "@sveltejs/kit";
import { db } from "@hoikka/core/server/db/index";
import { user } from "@hoikka/core/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ locals }: ServerLoadEvent) => {
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
