import config from "$hoikka/config";
import { parseFields, coerceFormFields, sanitizeRichtextFields } from "@hoikka/core/fields/index";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { contentPageService } from "@hoikka/core/server/services/content-pages";
import { translationService } from "@hoikka/core/server/services/translations";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { dbError } from "@hoikka/core/server/db-error";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "@hoikka/core/shared/utils";
import { sanitizeHtml } from "@hoikka/core/server/sanitize";

export const load = async ({ params }: ServerLoadEvent) => {
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

export const actions = {
	update: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const data = await request.formData();

		const title = data.get("title") as string;
		const slug = data.get("slug") as string;
		const body = data.get("body") as string;
		const imageUrl = data.get("imageUrl") as string | null;
		const published = data.get("published") === "on";
		const template = (data.get("template") as string) || "default";

		if (!title || !slug) {
			return fail(400, { error: "Title and slug are required" });
		}

		if (!config.contentPages.templates[template]) {
			return fail(400, { error: `Unknown page template "${template}"` });
		}
		const fieldDefs = config.contentPages.templates[template].fields;
		const parsedFields = parseFields(fieldDefs, coerceFormFields(fieldDefs, data));
		if (!parsedFields.ok) {
			return fail(400, { error: `Custom field ${parsedFields.error}` });
		}

		try {
			await contentPageService.update(id, {
				published,
				title,
				slug: slugify(slug),
				body: body ? sanitizeHtml(body) : undefined,
				imageUrl: imageUrl || null,
				template,
				...(fieldDefs.length > 0 && {
					customFields: sanitizeRichtextFields(
						fieldDefs,
						parsedFields.values,
						sanitizeHtml
					)
				})
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

	delete: async ({ params }: RequestEvent) => {
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
