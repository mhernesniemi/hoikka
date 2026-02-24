import { reindexAll } from "$lib/server/services/product-search.js";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const count = await reindexAll();
	return json({ success: true, count });
};
