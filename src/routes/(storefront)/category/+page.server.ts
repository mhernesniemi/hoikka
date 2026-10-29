import type { PageServerLoad } from "./$types";
import { categoryService } from "#lib/server/services/categories.js";

export const load: PageServerLoad = async () => {
	const tree = await categoryService.getTree();

	return { tree };
};
