import config from "$hoikka/config";
import { categoryService } from "@hoikka/core/server/services/categories";
import { taxService } from "@hoikka/core/server/services/tax";
import { translationService } from "@hoikka/core/server/services/translations";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { slugify } from "@hoikka/core/shared/utils";
import { dbError } from "@hoikka/core/server/db-error";
import { fail } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async () => {
	const [tree, categories, categoryTranslations, taxRates] = await Promise.all([
		categoryService.getTree(),
		categoryService.list(),
		translationService.getAllCategoryTranslations(),
		taxService.getAllTaxRates()
	]);

	return { tree, categories, categoryTranslations, taxRates };
};

export const actions = {
	create: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const slug = formData.get("slug") as string;
		const name = formData.get("name") as string;
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || config.tax.defaultRate;

		if (!slug || !name) {
			return fail(400, { error: "Slug and name are required" });
		}

		try {
			const category = await categoryService.create({
				slug: slug.toLowerCase().replace(/\s+/g, "-"),
				parentId: parentId ? Number(parentId) : null,
				name: name,
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

	update: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const id = Number(formData.get("id"));
		const slug = formData.get("slug") as string;
		const name = formData.get("name") as string;
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || config.tax.defaultRate;

		if (!id || !slug || !name) {
			return fail(400, { error: "All fields are required" });
		}

		try {
			await categoryService.update(id, {
				slug: slug.toLowerCase().replace(/\s+/g, "-"),
				parentId: parentId ? Number(parentId) : null,
				name: name,
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

	quickCreate: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const raw = (formData.get("names") as string) ?? "";
		const parentId = formData.get("parent_id") as string;
		const taxCode = (formData.get("tax_code") as string) || config.tax.defaultRate;

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

	delete: async ({ request }: RequestEvent) => {
		const formData = await request.formData();
		const id = Number(formData.get("id"));

		await categoryService.delete(id);

		return { deleted: true };
	}
};
