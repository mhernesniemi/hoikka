import config from "$hoikka/config";
import { parseFields, coerceFormFields, sanitizeRichtextFields } from "@hoikka/core/fields/index";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { collectionService } from "@hoikka/core/server/services/collections";
import { facetService } from "@hoikka/core/server/services/facets";
import { productService } from "@hoikka/core/server/services/products";
import { assetService } from "@hoikka/core/server/services/assets";
import { translationService } from "@hoikka/core/server/services/translations";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { dbError } from "@hoikka/core/server/db-error";
import type { SelectedImage } from "@hoikka/core/admin/upload";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "@hoikka/core/shared/utils";
import { sanitizeHtml } from "@hoikka/core/server/sanitize";

export const load = async ({ params }: ServerLoadEvent) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid collection ID");
	}

	const collection = await collectionService.getById(id);
	if (!collection) {
		throw error(404, "Collection not found");
	}

	// Load facets for filter builder
	const facets = await facetService.list();

	// Load all products for manual selection (admin sees all visibility states)
	const { items: products } = await productService.list({
		visibility: ["public", "private", "draft"],
		limit: 100
	});

	// Get product count
	const productCount = await collectionService.getProductCount(id);

	// Get matching products for the data table
	const [preview, translations] = await Promise.all([
		collectionService.getProductsForCollection(id, { limit: 100 }),
		translationService.getCollectionTranslations(id)
	]);

	return { collection, facets, products, productCount, preview: preview.items, translations };
};

export const actions = {
	update: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const data = await request.formData();

		const name = data.get("name") as string;
		const slug = data.get("slug") as string;
		const description = data.get("description") as string;
		const isPrivate = data.get("is_private") === "on";
		const filtersJson = data.get("filters") as string | null;

		if (!name || !slug) {
			return fail(400, { error: "Name and slug are required" });
		}

		const fieldDefs = config.collections.fields;
		const parsedFields = parseFields(fieldDefs, coerceFormFields(fieldDefs, data));
		if (!parsedFields.ok) {
			return fail(400, { error: `Custom field ${parsedFields.error}` });
		}

		try {
			await collectionService.update(id, {
				isPrivate,
				name,
				slug: slugify(slug),
				description: description ? sanitizeHtml(description) : undefined,
				...(config.collections.fields.length > 0 && {
					customFields: sanitizeRichtextFields(
						fieldDefs,
						parsedFields.values,
						sanitizeHtml
					)
				})
			});

			// Replace filters if provided
			if (filtersJson) {
				const filters = JSON.parse(filtersJson);
				await collectionService.replaceFilters(id, filters);
			}

			// Save translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tName = data.get(`name_${lang.code}`) as string;
				const tSlug = data.get(`slug_${lang.code}`) as string;
				const tDescription = data.get(`description_${lang.code}`) as string;

				await translationService.upsertCollectionTranslation(id, lang.code, {
					name: tName || "",
					slug: tSlug || "",
					description: tDescription ? sanitizeHtml(tDescription) : null
				});
			}

			return { success: true, message: "Collection updated successfully" };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to update collection") });
		}
	},

	preview: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const filtersJson = data.get("filters") as string;

		try {
			const filters = JSON.parse(filtersJson);
			const result = await collectionService.previewFilters(filters, {
				limit: 100
			});
			return { preview: result.products, productCount: result.total };
		} catch {
			return fail(400, { error: "Invalid filters" });
		}
	},

	delete: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			await collectionService.delete(id);
			throw redirect(303, "/admin/collections");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete collection") });
		}
	},

	addImage: async ({ params, request }: RequestEvent) => {
		const collectionId = Number(params.id);
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
				await assetService.addToCollection(collectionId, asset.id);
			}
			return { success: true, message: "Image added" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to add image") });
		}
	},

	removeImage: async ({ params, request }: RequestEvent) => {
		const collectionId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));

		if (isNaN(assetId)) {
			return fail(400, { error: "Invalid asset ID" });
		}

		try {
			await assetService.removeFromCollection(collectionId, assetId);
			return { success: true, message: "Image removed" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to remove image") });
		}
	},

	updateImageAlt: async ({ params, request }: RequestEvent) => {
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));
		const alt = formData.get("alt") as string;

		if (isNaN(assetId)) {
			return fail(400, { error: "Invalid asset ID" });
		}

		try {
			await assetService.updateAlt(assetId, alt || "");
			return { success: true, message: "Image updated" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update image") });
		}
	}
};
