/**
 * List images from local asset storage.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { list } from "@hoikka/core/server/storage/index";
import { isPrivatePath } from "@hoikka/core/server/storage/types";

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const folder = url.searchParams.get("folder")?.replace(/^\//, "") || "products";

	// The digital deliverables namespace is not a media folder
	if (isPrivatePath(folder)) throw error(404, "Not found");

	try {
		return json(await list(folder));
	} catch {
		return json({ error: "Failed to list files" }, { status: 500 });
	}
};
