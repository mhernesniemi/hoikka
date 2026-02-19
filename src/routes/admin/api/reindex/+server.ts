import { reindexAll } from "$lib/server/services/product-search.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async () => {
	const count = await reindexAll();
	return json({ success: true, count });
};
