import { categoryService } from "$lib/server/services/categories.js";
import { taxService } from "$lib/server/services/tax.js";
import { translationService } from "$lib/server/services/translations.js";
import { TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
import { slugify } from "$lib/utils.js";
import { dbError } from "$lib/server/db-error.js";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [tree, categories, categoryTranslations, taxRates] = await Promise.all([
		categoryService.getTree(),
		categoryService.list(),
		translationService.getAllCategoryTranslations(),
		taxService.getAllTaxRates()
	]);

	return { tree, categories, categoryTranslations, taxRates };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const slug = formData.get("slug") as string;
		const nameEn = formData.get("name_en") as string;
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || "standard";

		if (!slug || !nameEn) {
			return fail(400, { error: "Slug and name are required" });
		}

		try {
			const category = await categoryService.create({
				slug: slug.toLowerCase().replace(/\s+/g, "-"),
				parentId: parentId ? Number(parentId) : null,
				name: nameEn,
				taxCode
			});

			if (category) {
				for (const lang of TRANSLATION_LANGUAGES) {
					const name = formData.get(`name_${lang.code}`) as string;
					if (name) {
						await translationService.upsertCategoryTranslation(category.id, lang.code, {
							name
						});
					}
				}
			}

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to create category") });
		}
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get("id"));
		const slug = formData.get("slug") as string;
		const nameEn = formData.get("name_en") as string;
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || "standard";

		if (!id || !slug || !nameEn) {
			return fail(400, { error: "All fields are required" });
		}

		try {
			await categoryService.update(id, {
				slug: slug.toLowerCase().replace(/\s+/g, "-"),
				parentId: parentId ? Number(parentId) : null,
				name: nameEn,
				taxCode
			});

			for (const lang of TRANSLATION_LANGUAGES) {
				const name = formData.get(`name_${lang.code}`) as string;
				await translationService.upsertCategoryTranslation(id, lang.code, {
					name: name || ""
				});
			}

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update category") });
		}
	},

	quickCreate: async ({ request }) => {
		const formData = await request.formData();
		const raw = (formData.get("names") as string) ?? "";
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || "standard";

		const names = raw
			.split(",")
			.map((n) => n.trim())
			.filter(Boolean);

		if (names.length === 0) {
			return fail(400, { error: "At least one name is required" });
		}

		try {
			for (const name of names) {
				await categoryService.create({
					slug: slugify(name),
					parentId: parentId ? Number(parentId) : null,
					name,
					taxCode
				});
			}

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to create category") });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get("id"));

		await categoryService.delete(id);

		return { deleted: true };
	}
};
