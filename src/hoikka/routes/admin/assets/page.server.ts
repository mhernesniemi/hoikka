import { assetService, assetDeleteError } from "@hoikka/core/server/services/assets";
import { dbError } from "@hoikka/core/server/db-error";
import type { SelectedImage } from "@hoikka/core/admin/upload";
import { fail } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async () => {
	await assetService.backfillVariantImages();
	const assets = await assetService.list();
	return { assets };
};

export const actions = {
	addAsset: async ({ request }: RequestEvent) => {
		const formData = await request.formData();

		let files: SelectedImage[];
		try {
			files = formData.getAll("files").map((entry) => JSON.parse(String(entry)));
		} catch {
			return fail(400, { error: "Image data is required" });
		}

		if (files.length === 0 || files.some((file) => !file.url || !file.name)) {
			return fail(400, { error: "Image data is required" });
		}

		try {
			for (const file of files) {
				const asset = await assetService.create({
					name: file.name,
					url: file.url,
					width: file.width || 0,
					height: file.height || 0,
					fileSize: file.size || 0
				});
				if (file.alt) {
					await assetService.updateAlt(asset.id, file.alt);
				}
			}
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to add asset") });
		}
	},

	deleteSelected: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No assets selected" });
		}

		try {
			await Promise.all(ids.map((id) => assetService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(400, { error: assetDeleteError(e, "Failed to delete assets") });
		}
	}
};
