/**
 * Serves uploaded assets from the active storage backend (local fs or R2),
 * so `/uploads/...` URLs work identically on both deployment targets.
 * Filenames contain a random id, so responses are safely immutable.
 */
import { error } from "@sveltejs/kit";
import { get } from "$lib/server/storage/index.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async ({ params }) => {
	const file = await get(params.path);
	if (!file) throw error(404, "Not found");

	return new Response(file.body, {
		headers: {
			"content-type": file.contentType,
			"content-length": String(file.size),
			"cache-control": "public, max-age=31536000, immutable"
		}
	});
};
