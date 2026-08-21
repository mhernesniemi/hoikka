import type { PageServerLoad } from "./$types";
import { categoryService } from "@hoikka/core/server/services/categories";

export const load: PageServerLoad = async () => {
	const tree = await categoryService.getTree();

	return { tree };
};
