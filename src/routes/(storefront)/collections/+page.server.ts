import type { PageServerLoad } from "./$types";
import { collectionService } from "@hoikka/core/server/services/collections";

export const load: PageServerLoad = async () => {
	const collections = await collectionService.list();

	return { collections };
};
