import config from "$hoikka/config";
import { parseFields, coerceFormFields, sanitizeRichtextFields } from "@hoikka/core/fields/index";
import { productService } from "@hoikka/core/server/services/products";
import { reindexProduct, removeFromIndex } from "@hoikka/core/server/services/product-search";
import { facetService } from "@hoikka/core/server/services/facets";
import { assetService, assetDeleteError } from "@hoikka/core/server/services/assets";
import { categoryService } from "@hoikka/core/server/services/categories";
import { collectionService } from "@hoikka/core/server/services/collections";
import { translationService } from "@hoikka/core/server/services/translations";
import { relatedProductService } from "@hoikka/core/server/services/related-products";
import { sanitizeHtml } from "@hoikka/core/server/sanitize";
import { TRANSLATION_LANGUAGES } from "@hoikka/core/config/derived";
import { PRODUCT_TYPES } from "@hoikka/core/config/derived";
import { dbError } from "@hoikka/core/server/db-error";
import type { SelectedImage } from "@hoikka/core/admin/upload";
import { error, fail, redirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ params }: ServerLoadEvent) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Invalid product ID");
	}

	const product = await productService.getById(id);

	if (!product) {
		throw error(404, "Product not found");
	}

	const [
		facets,
		categoryTree,
		productCategories,
		productCollections,
		translations,
		manualRelations
	] = await Promise.all([
		facetService.list(),
		categoryService.getTree(),
		categoryService.getProductCategories(id),
		collectionService.getCollectionsForProduct(id),
		translationService.getProductTranslations(id),
		relatedProductService.getManualRelations(id)
	]);

	// Load asset translations for all product assets
	const assetIds = product.assets.map((a) => a.id);
	const assetTranslationsMap = await translationService.getAllAssetTranslations(assetIds);

	// Load full product data for manual relations + lightweight catalog for picker
	const [relatedProductsList, allProducts] = await Promise.all([
		manualRelations.length > 0
			? Promise.all(
					manualRelations.map((r) => productService.getById(r.relatedProductId))
				).then((results) => results.filter((p) => p !== null))
			: Promise.resolve([]),
		productService.getSearchCatalog()
	]);

	// The deliverable file of a digital product (name only — the file itself is
	// never linked from the admin, it is served through /downloads/<token>).
	const digitalAsset = product.digitalAssetId
		? await assetService.getById(product.digitalAssetId)
		: null;

	return {
		product,
		digitalAsset,
		facets,
		categoryTree,
		productCategories,
		productCollections,
		translations,
		assetTranslationsMap,
		relatedProducts: relatedProductsList,
		allProducts,
		productTypes: PRODUCT_TYPES
	};
};

export const actions = {
	update: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const formData = await request.formData();

		const name = formData.get("name") as string;
		const slug = formData.get("slug") as string;
		const description = formData.get("description") as string;
		const type = formData.get("type") as "physical" | "digital" | null;
		const visibility = formData.get("visibility") as "public" | "private" | "draft";

		// Facet values, categories, and related products
		const facetValueIds = formData
			.getAll("facetValueIds")
			.map(Number)
			.filter((id) => !isNaN(id));
		const categoryIds = formData
			.getAll("categoryIds")
			.map(Number)
			.filter((id) => !isNaN(id));
		const relatedProductIds = formData
			.getAll("relatedProductIds")
			.map(Number)
			.filter((id) => !isNaN(id));

		if (!name || !slug) {
			return fail(400, { error: "Name and slug are required" });
		}

		// A public digital product with no file would take money and deliver
		// nothing — refuse the combination at the point it is created.
		if (type === "digital" && visibility === "public") {
			const current = await productService.getById(id);
			if (!current?.digitalAssetId) {
				return fail(400, {
					error: "Add a digital file before publishing this product"
				});
			}
		}

		// Custom fields for the (possibly just-changed) product type, validated
		// against the definitions in hoikka.config.ts. Single-type stores hide
		// the type selector, so `type` may be absent — fall back to what the
		// product already is.
		const currentProduct = await productService.getById(id);
		const effectiveType = type ?? currentProduct?.type ?? config.defaultProductType;
		const fieldDefs = config.productTypes[effectiveType]?.fields ?? [];
		const parsedFields = parseFields(fieldDefs, coerceFormFields(fieldDefs, formData));
		if (!parsedFields.ok) {
			return fail(400, { error: `Custom field ${parsedFields.error}` });
		}

		try {
			// Update product
			await productService.update(id, {
				...(type && { type }),
				visibility,
				name,
				slug,
				description: description ? sanitizeHtml(description) : undefined,
				...(fieldDefs.length > 0 && {
					customFields: sanitizeRichtextFields(
						fieldDefs,
						parsedFields.values,
						sanitizeHtml
					)
				})
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

			// Update related products
			await relatedProductService.setManualRelations(id, relatedProductIds);

			// Save translations
			for (const lang of TRANSLATION_LANGUAGES) {
				const tName = formData.get(`name_${lang.code}`) as string;
				const tSlug = formData.get(`slug_${lang.code}`) as string;
				const tDescription = formData.get(`description_${lang.code}`) as string;

				await translationService.upsertProductTranslation(id, lang.code, {
					name: tName || "",
					slug: tSlug || "",
					description: tDescription ? sanitizeHtml(tDescription) : null
				});
			}

			await reindexProduct(id);

			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update product") });
		}
	},

	delete: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		await productService.delete(id);
		await removeFromIndex(id);

		throw redirect(303, "/admin/products");
	},

	updateFacetValues: async ({ params, request }: RequestEvent) => {
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

			await reindexProduct(productId);

			return { facetSuccess: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to update facet values") });
		}
	},

	addImage: async ({ params, request }: RequestEvent) => {
		const productId = Number(params.id);
		const formData = await request.formData();

		let files: SelectedImage[];
		try {
			files = formData.getAll("files").map((entry) => JSON.parse(String(entry)));
		} catch {
			return fail(400, { imageError: "Image data is required" });
		}

		if (files.length === 0 || files.some((file) => !file.url || !file.name)) {
			return fail(400, { imageError: "Image data is required" });
		}

		try {
			for (const file of files) {
				// Reuse existing asset if one already exists with this URL
				const existing = await assetService.getBySource(file.url);
				const asset =
					existing ??
					(await assetService.create({
						name: file.name,
						url: file.url,
						width: file.width || 0,
						height: file.height || 0,
						fileSize: file.size || 0
					}));
				await assetService.addToProduct(productId, asset.id);

				// Update alt text if provided
				if (file.alt) {
					await assetService.updateAlt(asset.id, file.alt);
				}
			}

			await reindexProduct(productId);

			return { imageSuccess: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to add image") });
		}
	},

	removeImage: async ({ params, request }: RequestEvent) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));

		if (isNaN(assetId)) {
			return fail(400, { imageError: "Invalid asset ID" });
		}

		try {
			await assetService.removeFromProduct(productId, assetId);
			await assetService.delete(assetId);
			await reindexProduct(productId);
			return { imageRemoved: true };
		} catch (e) {
			return fail(400, { imageError: assetDeleteError(e, "Failed to remove image") });
		}
	},

	setFeaturedImage: async ({ params, request }: RequestEvent) => {
		const productId = Number(params.id);
		const formData = await request.formData();
		const assetId = Number(formData.get("assetId"));

		if (isNaN(assetId)) {
			return fail(400, { imageError: "Invalid asset ID" });
		}

		try {
			await assetService.setFeaturedAsset(productId, assetId);
			await reindexProduct(productId);
			return { featuredSet: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to set featured image") });
		}
	},

	/**
	 * Attach the file a digital product delivers. Without one, checkout
	 * completion records a fulfilment error instead of delivering nothing.
	 */
	setDigitalFile: async ({ params, request }: RequestEvent) => {
		const productId = Number(params.id);
		const formData = await request.formData();

		const url = formData.get("url")?.toString();
		const name = formData.get("name")?.toString();
		const mimeType = formData.get("mimeType")?.toString() || undefined;
		const fileSize = Number(formData.get("size")) || 0;

		if (!url || !name) {
			return fail(400, { digitalError: "File data is required" });
		}

		try {
			const existing = await assetService.getBySource(url);
			const asset =
				existing ?? (await assetService.create({ name, url, fileSize, mimeType }));

			await productService.setDigitalAsset(productId, asset.id);
			return { digitalSuccess: true };
		} catch (e) {
			return fail(500, { digitalError: dbError(e, "Failed to save digital file") });
		}
	},

	removeDigitalFile: async ({ params }: RequestEvent) => {
		const productId = Number(params.id);
		try {
			// Unpublish alongside: a public digital product without a file is
			// exactly the state that charges customers for nothing.
			const product = await productService.getById(productId);
			if (product?.type === "digital" && product.visibility === "public") {
				await productService.update(productId, { visibility: "draft" });
			}
			await productService.setDigitalAsset(productId, null);
			return { digitalRemoved: true };
		} catch (e) {
			return fail(500, { digitalError: dbError(e, "Failed to remove digital file") });
		}
	},

	updateCategories: async ({ params, request }: RequestEvent) => {
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

	createVariant: async ({ params, request }: RequestEvent) => {
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

			await reindexProduct(productId);

			return { variantCreated: true };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to create variant") });
		}
	},

	deleteVariant: async ({ params, request }: RequestEvent) => {
		const formData = await request.formData();
		const variantId = Number(formData.get("variantId"));

		if (isNaN(variantId)) {
			return fail(400, { error: "Invalid variant ID" });
		}

		try {
			await productService.deleteVariant(variantId);
			await reindexProduct(Number(params.id));
			return { variantDeleted: true };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to delete variant") });
		}
	},

	updateImageAlt: async ({ params, request }: RequestEvent) => {
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

			// Save translation alt texts
			for (const lang of TRANSLATION_LANGUAGES) {
				const tAlt = formData.get(`alt_${lang.code}`) as string;
				await translationService.upsertAssetTranslation(assetId, lang.code, {
					alt: tAlt || null
				});
			}

			if (setFeatured) {
				await assetService.setFeaturedAsset(productId, assetId);
			}

			await reindexProduct(productId);

			return { altUpdated: true };
		} catch (e) {
			return fail(500, { imageError: dbError(e, "Failed to update image") });
		}
	}
};
