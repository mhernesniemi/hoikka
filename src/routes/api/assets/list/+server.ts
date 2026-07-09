/**
 * List images from local asset storage.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { list } from "$lib/server/storage.js";

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const folder = url.searchParams.get("folder")?.replace(/^\//, "") || "products";

	try {
		return json(await list(folder));
	} catch {
		return json({ error: "Failed to list files" }, { status: 500 });
	}
};
