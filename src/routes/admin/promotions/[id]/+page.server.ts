import type { PageServerLoad, Actions } from "./$types";
import { promotionService } from "$lib/server/services/promotions.js";
import { productService } from "$lib/server/services/products.js";
import { collectionService } from "$lib/server/services/collections.js";
import { customerGroupService } from "$lib/server/services/customerGroups.js";
import { dbError } from "$lib/server/db-error.js";
import { parsePromotionUpdateForm } from "../promotion-form.server.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	const promotion = await promotionService.getByIdWithRelations(id);

	if (!promotion) {
		throw error(404, "Promotion not found");
	}

	const { items: products } = await productService.list({
		visibility: ["public", "private", "draft"],
		limit: 100
	});

	const collections = await collectionService.list();
	const customerGroups = await customerGroupService.list();

	return {
		promotion,
		products: products.map((p) => ({
			id: p.id,
			name: p.name || `Product #${p.id}`
		})),
		collections: collections.map((c) => ({
			id: c.id,
			name: c.name || `Collection #${c.id}`
		})),
		customerGroups: customerGroups.map((g) => ({
			id: g.id,
			name: g.name
		}))
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = Number(params.id);
		const data = await request.formData();

		const {
			title,
			discountType,
			discountValueRaw,
			appliesTo,
			minOrderAmountRaw,
			usageLimit,
			usageLimitPerCustomer,
			combinesWithOtherPromotions,
			customerGroupId,
			startsAt,
			endsAt,
			enabled,
			productIds,
			collectionIds
		} = parsePromotionUpdateForm(data);

		// Convert to cents for fixed_amount
		const discountValue =
			discountValueRaw !== undefined && discountType === "fixed_amount"
				? discountValueRaw * 100
				: discountValueRaw;

		const minOrderAmount = minOrderAmountRaw ? minOrderAmountRaw * 100 : null;

		try {
			await promotionService.update(id, {
				title,
				discountType: discountType ?? undefined,
				discountValue,
				appliesTo: appliesTo ?? undefined,
				minOrderAmount,
				usageLimit,
				usageLimitPerCustomer,
				combinesWithOtherPromotions,
				customerGroupId,
				startsAt,
				endsAt,
				enabled,
				productIds: appliesTo === "specific_products" ? productIds : [],
				collectionIds: appliesTo === "specific_collections" ? collectionIds : []
			});

			return { success: true };
		} catch (err) {
			return fail(500, { error: dbError(err, "Failed to update promotion") });
		}
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		try {
			await promotionService.delete(id);
			throw redirect(303, "/admin/promotions");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete promotion") });
		}
	}
};
