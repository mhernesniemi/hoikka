import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { promotionService } from "@hoikka/core/server/services/promotions";
import { productService } from "@hoikka/core/server/services/products";
import { collectionService } from "@hoikka/core/server/services/collections";
import { customerGroupService } from "@hoikka/core/server/services/customerGroups";
import { dbError } from "@hoikka/core/server/db-error";
import { parsePromotionUpdateForm } from "../promotion-form.server.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";

export const load = async ({ params }: ServerLoadEvent) => {
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

export const actions = {
	update: async ({ request, params }: RequestEvent) => {
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

	delete: async ({ params }: RequestEvent) => {
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
