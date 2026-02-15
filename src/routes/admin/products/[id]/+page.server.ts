import { productService } from "$lib/server/services/products.js";
import { facetService } from "$lib/server/services/facets.js";
import { assetService } from "$lib/server/services/assets.js";
import { categoryService } from "$lib/server/services/categories.js";
import { collectionService } from "$lib/server/services/collections.js";
import { translationService } from "$lib/server/services/translations.js";
import { TRANSLATION_LANGUAGES } from "$lib/config/languages.js";
import { PRODUCT_TYPES } from "$lib/config/products.js";
import { dbError } from "$lib/server/db-error.js";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Invalid product ID");
	}

	const product = await productService.getById(id);

	if (!product) {
		throw error(404, "Product not found");
	}

	const [facets, categoryTree, productCategories, productCollections, translations] =
		await Promise.all([
			facetService.list(),
			categoryService.getTree(),
			categoryService.getProductCategories(id),
			collectionService.getCollectionsForProduct(id),
			translationService.getProductTranslations(id)
		]);

	return {
		product,
		facets,
		categoryTree,
		productCategories,
		productCollections,
		translations,
		productTypes: PRODUCT_TYPES
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const id = Number(params.id);
		const formData = await request.formData();

		const name = formData.get("name") as string;
		const slug = formData.get("slug") as string;
		const description = formData.get("description") as string;
		const type = formData.get("type") as "physical" | "digital" | null;
		const visibility = formData.get("visibility") as "public" | "private" | "draft";

		// Facet values and categories
		const facetValueIds = formData
			.getAll("facetValueIds")
			.map(Number)
			.filter((id) => !isNaN(id));
		const categoryIds = formData
			.getAll("categoryIds")
			.map(Number)
			.filter((id) => !isNaN(id));

		if (!name || !slug) {
			return fail(400, { error: "Name and slug are required" });
		}

		try {
			// Update product
			await productService.update(id, {
				...(type && { type }),
				visibility,
				name,
				slug,
				description: description || undefined
			});

			// Update facet values
			const product = await productService.getById(id);
			if (product) {
				const currentFacetIds = product.facetValues.map((fv) => fv.id);
				for (const fvId of currentFacetIds) {
					if (!facetValueIds.includes(fvId)) {
						await productService.removeFacetValue(id, fvId);
					}
				}
				for (const fvId of facetValueIds) {
					if (!currentFacetIds.includes(fvId)) {
						await productService.addFacetValue(id, fvId);
					}
				}
			}

			// Update categories
			await categoryService.setProductCategories(id, categoryIds);

			// Save translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tName = formData.get(`name_${lang.code}`) as string;
				const tSlug = formData.get(`slug_${lang.code}`) as string;
				const tDescription = formData.get(`description_${lang.code}`) as string;

				await translationService.upsertProductTranslation(id, lang.code, {
					name: tName || "",
					slug: tSlug || "",
					description: tDescription || null
				});
			}

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update product") });
		}
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		await productService.delete(id);

		throw redirect(303, "/admin/products");
	},

	updateFacetValues: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const facetValueIds = formData.getAll("facetValueIds").map(Number);

		try {
			// Get current facet values
			const product = await productService.getById(productId);
			if (!product) {
				return fail(404, { error: "Product not found" });
			}

			const currentIds = product.facetValues.map((fv) => fv.id);

			// Remove unchecked values
			for (const id of currentIds) {
				if (!facetValueIds.includes(id)) {
					await productService.removeFacetValue(productId, id);
				}
			}

			// Add newly checked values
			for (const id of facetValueIds) {
				if (!currentIds.includes(id)) {
					await productService.addFacetValue(productId, id);
				}
			}

			return { facetSuccess: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update facet values") });
		}
	},

	addImage: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();

		const url = formData.get("url") as string;
		const name = formData.get("name") as string;
		const fileId = formData.get("fileId") as string;
		const width = Number(formData.get("width")) || 0;
		const height = Number(formData.get("height")) || 0;
		const fileSize = Number(formData.get("fileSize")) || 0;
		const alt = formData.get("alt") as string;

		if (!url || !name) {
			return fail(400, { imageError: "Image data is required" });
		}

		try {
			const asset = await assetService.create({ name, url, fileId, width, height, fileSize });
			await assetService.addToProduct(productId, asset.id);

			// Update alt text if provided
			if (alt) {
				await assetService.updateAlt(asset.id, alt);
			}

			return { imageSuccess: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to add image") });
		}
	},

	removeImage: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));

		if (isNaN(assetId)) {
			return fail(400, { imageError: "Invalid asset ID" });
		}

		try {
			await assetService.removeFromProduct(productId, assetId);
			await assetService.delete(assetId);
			return { imageRemoved: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to remove image") });
		}
	},

	setFeaturedImage: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));

		if (isNaN(assetId)) {
			return fail(400, { imageError: "Invalid asset ID" });
		}

		try {
			await assetService.setFeaturedAsset(productId, assetId);
			return { featuredSet: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to set featured image") });
		}
	},

	updateCategories: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const categoryIds = formData
			.getAll("categoryIds")
			.map(Number)
			.filter((id) => !isNaN(id));

		try {
			await categoryService.setProductCategories(productId, categoryIds);
			return { categorySuccess: true };
		} catch (e) {
			return fail(500, { categoryError: dbError(e, "Failed to update categories") });
		}
	},

	createVariant: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();

		const sku = (formData.get("sku") as string)?.trim();
		const price = Number(formData.get("price")) * 100; // Convert to cents
		const trackInventory = formData.get("trackInventory") === "on";
		const stock = trackInventory ? Number(formData.get("stock")) || 0 : 0;
		const name = (formData.get("variant_name") as string)?.trim();

		if (!sku || isNaN(price)) {
			return fail(400, { error: "SKU and price are required" });
		}

		try {
			await productService.createVariant({
				productId,
				sku,
				price,
				stock,
				trackInventory,
				name: name || undefined
			});

			return { variantCreated: true };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to create variant") });
		}
	},

	updateImageAlt: async ({ params, request }) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));
		const alt = formData.get("alt") as string;
		const setFeatured = formData.get("setFeatured") === "true";

		if (isNaN(assetId)) {
			return fail(400, { imageError: "Invalid asset ID" });
		}

		try {
			await assetService.updateAlt(assetId, alt || "");

			if (setFeatured) {
				await assetService.setFeaturedAsset(productId, assetId);
			}

			return { altUpdated: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to update image") });
		}
	}
};
