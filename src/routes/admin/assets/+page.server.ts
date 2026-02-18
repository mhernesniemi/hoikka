import { assetService } from "$lib/server/services/assets.js";
import { dbError } from "$lib/server/db-error.js";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const assets = await assetService.list();
	return { assets };
};

export const actions: Actions = {
	addAsset: async ({ request }) => {
		const formData = await request.formData();
		const url = formData.get("url") as string;
		const name = formData.get("name") as string;
		const width = Number(formData.get("width")) || 0;
		const height = Number(formData.get("height")) || 0;
		const fileSize = Number(formData.get("fileSize")) || 0;
		const alt = formData.get("alt") as string;

		if (!url || !name) {
			return fail(400, { error: "Image data is required" });
		}

		try {
			const asset = await assetService.create({ name, url, width, height, fileSize });
			if (alt) {
				await assetService.updateAlt(asset.id, alt);
			}
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to add asset") });
		}
	},

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
