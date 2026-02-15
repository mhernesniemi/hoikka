import type { PageServerLoad, Actions } from "./$types";
import { collectionService } from "$lib/server/services/collections.js";
import { facetService } from "$lib/server/services/facets.js";
import { productService } from "$lib/server/services/products.js";
import { assetService } from "$lib/server/services/assets.js";
import { translationService } from "$lib/server/services/translations.js";
import { TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
import { dbError } from "$lib/server/db-error.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import { slugify } from "$lib/utils.js";

export const load: PageServerLoad = async ({ params }) => {
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

export const actions: Actions = {
	update: async ({ params, request }) => {
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

		try {
			await collectionService.update(id, {
				isPrivate,
				name,
				slug: slugify(slug),
				description: description || undefined
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
					description: tDescription || null
				});
			}

			return { success: true, message: "Collection updated successfully" };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to update collection") });
		}
	},

	preview: async ({ request }) => {
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

	delete: async ({ params }) => {
		const id = Number(params.id);

		try {
			await collectionService.delete(id);
			throw redirect(303, "/admin/collections");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete collection") });
		}
	},

	addImage: async ({ params, request }) => {
		const collectionId = Number(params.id);
		const formData = await request.formData();

		const url = formData.get("url") as string;
		const name = formData.get("name") as string;
		const fileId = formData.get("fileId") as string;
		const width = Number(formData.get("width")) || 0;
		const height = Number(formData.get("height")) || 0;
		const fileSize = Number(formData.get("fileSize")) || 0;
		const alt = formData.get("alt") as string;

		if (!url || !name) {
			return fail(400, { error: "Image data is required" });
		}

		try {
			const asset = await assetService.create({ name, url, fileId, width, height, fileSize });
			if (alt) {
				await assetService.updateAlt(asset.id, alt);
			}
			await assetService.addToCollection(collectionId, asset.id);
			return { success: true, message: "Image added" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to add image") });
		}
	},

	removeImage: async ({ params, request }) => {
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

	updateImageAlt: async ({ params, request }) => {
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
