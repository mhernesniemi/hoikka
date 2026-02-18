import { assetService } from "$lib/server/services/assets.js";
import { dbError } from "$lib/server/db-error.js";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const assets = await assetService.list();
	return { assets };
};

export const actions: Actions = {
	deleteSelected: async ({ request }) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No assets selected" });
		}

		try {
			await Promise.all(ids.map((id) => assetService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete assets") });
		}
	}
};
