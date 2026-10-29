import type { PageServerLoad } from "./$types";
import { collectionService } from "#lib/server/services/collections.js";

export const load: PageServerLoad = async () => {
	const collections = await collectionService.list();

	return { collections };
};
