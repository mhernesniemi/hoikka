import type { PageServerLoad, Actions } from "./$types";
import { contentPageService } from "$lib/server/services/content-pages.js";
import { translationService } from "$lib/server/services/translations.js";
import { TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
import { dbError } from "$lib/server/db-error.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "$lib/utils.js";
import { sanitizeHtml } from "$lib/server/sanitize.js";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid page ID");
	}

	const [page, translations] = await Promise.all([
		contentPageService.getById(id),
		translationService.getContentPageTranslations(id)
	]);
	if (!page) {
		throw error(404, "Content page not found");
	}

	return { page, translations };
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const id = Number(params.id);
		const data = await request.formData();

		const title = data.get("title") as string;
		const slug = data.get("slug") as string;
		const body = data.get("body") as string;
		const imageUrl = data.get("imageUrl") as string | null;
		const published = data.get("published") === "on";

		if (!title || !slug) {
			return fail(400, { error: "Title and slug are required" });
		}

		try {
			await contentPageService.update(id, {
				published,
				title,
				slug: slugify(slug),
				body: body ? sanitizeHtml(body) : undefined,
				imageUrl: imageUrl || null
			});

			// Save translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tTitle = data.get(`title_${lang.code}`) as string;
				const tSlug = data.get(`slug_${lang.code}`) as string;
				const tBody = data.get(`body_${lang.code}`) as string;

				await translationService.upsertContentPageTranslation(id, lang.code, {
					title: tTitle || "",
					slug: tSlug || "",
					body: tBody ? sanitizeHtml(tBody) : null
				});
			}

			return { success: true, message: "Page updated successfully" };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to update page") });
		}
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		try {
			await contentPageService.delete(id);
			throw redirect(303, "/admin/content-pages");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete page") });
		}
	}
};
