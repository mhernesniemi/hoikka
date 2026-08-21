import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { assetService, assetDeleteError } from "@hoikka/core/server/services/assets";
import { translationService } from "@hoikka/core/server/services/translations";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { dbError } from "@hoikka/core/server/db-error";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";

export const load = async ({ params }: ServerLoadEvent) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid asset ID");
	}

	const [asset, translations] = await Promise.all([
		assetService.getById(id),
		translationService.getAssetTranslations(id)
	]);

	if (!asset) {
		throw error(404, "Asset not found");
	}

	return { asset, translations };
};

export const actions = {
	update: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const formData = await request.formData();

		const name = formData.get("name") as string;
		const alt = formData.get("alt") as string;
		const focalX = formData.get("focalX") as string;
		const focalY = formData.get("focalY") as string;

		if (!name) {
			return fail(400, { error: "Name is required" });
		}

		try {
			await assetService.update(id, {
				name,
				alt: alt || "",
				focalX: Number(focalX) || 0.5,
				focalY: Number(focalY) || 0.5
			});

			// Save translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tAlt = formData.get(`alt_${lang.code}`) as string;
				await translationService.upsertAssetTranslation(id, lang.code, {
					alt: tAlt || null
				});
			}

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update asset") });
		}
	},

	delete: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			await assetService.delete(id);
			throw redirect(303, "/admin/assets");
		} catch (e) {
			if (isRedirect(e)) throw e;
			return fail(400, { error: assetDeleteError(e, "Failed to delete asset") });
		}
	}
};
