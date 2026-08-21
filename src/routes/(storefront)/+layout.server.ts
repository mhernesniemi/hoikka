import { promotionService } from "@hoikka/core/server/services/promotions";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
	// Only globally shared data here: guest pages are edge-cached, so this
	// load must never read cookies. Cart/wishlist badges hydrate from remote
	// queries client-side.
	return {
		activeDiscounts: await promotionService.getActiveProductDiscounts()
	};
};
