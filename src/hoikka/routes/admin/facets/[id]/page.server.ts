import { facetService } from "@hoikka/core/server/services/facets";
import { translationService } from "@hoikka/core/server/services/translations";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { dbError } from "@hoikka/core/server/db-error";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ params }: ServerLoadEvent) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid facet ID");
	}

	const [facet, facetTranslations, valueTranslations] = await Promise.all([
		facetService.getById(id),
		translationService.getFacetTranslations(id),
		translationService.getAllFacetValueTranslations(id)
	]);
	if (!facet) {
		throw error(404, "Facet not found");
	}

	return { facet, facetTranslations, valueTranslations };
};

export const actions = {
	update: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const code = formData.get("code") as string;
		const name = formData.get("name") as string;
		const isHidden = formData.get("is_hidden") === "on";

		if (!code || !name) {
			return fail(400, { error: "All fields are required" });
		}

		try {
			await facetService.update(id, {
				code: code.toLowerCase().replace(/\s+/g, "_"),
				name: name,
				isHidden
			});

			// Save facet translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tName = formData.get(`name_${lang.code}`) as string;
				await translationService.upsertFacetTranslation(id, lang.code, {
					name: tName || ""
				});
			}

			// Sync values from client state
			const valuesJson = formData.get("values_json") as string;
			const submittedValues: {
				id: number | null;
				name: string;
				code: string;
				translations: Record<string, string>;
			}[] = JSON.parse(valuesJson || "[]");
			const submittedIds = new Set(submittedValues.filter((v) => v.id).map((v) => v.id));

			// Delete removed values
			const facet = await facetService.getById(id);
			if (facet) {
				for (const existing of facet.values) {
					if (!submittedIds.has(existing.id)) {
						await facetService.deleteValue(existing.id);
					}
				}
			}

			// Create or update values
			for (const v of submittedValues) {
				if (!v.name || !v.code) continue;
				const normalizedCode = v.code.toLowerCase().replace(/\s+/g, "_");

				let valueId: number;
				if (v.id) {
					await facetService.updateValue(v.id, { name: v.name, code: normalizedCode });
					valueId = v.id;
				} else {
					const created = await facetService.createValue({
						facetId: id,
						name: v.name,
						code: normalizedCode
					});
					valueId = created.id;
				}

				for (const lang of TRANSLATION_LANGUAGES) {
					await translationService.upsertFacetValueTranslation(valueId, lang.code, {
						name: v.translations?.[lang.code] || ""
					});
				}
			}

			return { success: true, message: "Facet updated" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update facet") });
		}
	},

	delete: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			await facetService.delete(id);
			throw redirect(303, "/admin/facets");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete facet") });
		}
	}
};
