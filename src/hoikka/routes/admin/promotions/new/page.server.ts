import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { promotionService } from "@hoikka/core/server/services/promotions";
import { productService } from "@hoikka/core/server/services/products";
import { collectionService } from "@hoikka/core/server/services/collections";
import { customerGroupService } from "@hoikka/core/server/services/customerGroups";
import { dbError } from "@hoikka/core/server/db-error";
import { parsePromotionCreateForm } from "../promotion-form.server.js";
import { fail, redirect, isRedirect } from "@sveltejs/kit";

export const load = async () => {
	const { items: products } = await productService.list({
		visibility: ["public", "private", "draft"],
		limit: 100
	});

	const collections = await collectionService.list();
	const customerGroups = await customerGroupService.list();

	return {
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
	default: async ({ request }: RequestEvent) => {
		const data = await request.formData();

		const {
			method,
			code,
			title,
			promotionType,
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
			productIds,
			collectionIds
		} = parsePromotionCreateForm(data);

		if (!promotionType) {
			return fail(400, { error: "Promotion type is required" });
		}

		if (method === "code" && !code) {
			return fail(400, { error: "Code is required for discount code promotions" });
		}

		if (method === "automatic" && !title) {
			return fail(400, { error: "Title is required for automatic discount promotions" });
		}

		if (promotionType !== "free_shipping" && (isNaN(discountValueRaw) || !discountType)) {
			return fail(400, { error: "Discount type and value are required" });
		}

		// Convert to cents for fixed_amount
		const discountValue =
			promotionType === "free_shipping"
				? 0
				: discountType === "fixed_amount"
					? discountValueRaw * 100
					: discountValueRaw;

		const minOrderAmount = minOrderAmountRaw ? minOrderAmountRaw * 100 : undefined;

		try {
			const promotion = await promotionService.create({
				method,
				code: method === "code" ? code : undefined,
				title: method === "automatic" ? title : undefined,
				promotionType,
				discountType: promotionType === "free_shipping" ? "fixed_amount" : discountType,
				discountValue,
				appliesTo: promotionType === "product" ? appliesTo : "all",
				minOrderAmount,
				usageLimit,
				usageLimitPerCustomer,
				combinesWithOtherPromotions,
				customerGroupId,
				startsAt,
				endsAt,
				productIds: appliesTo === "specific_products" ? productIds : [],
				collectionIds: appliesTo === "specific_collections" ? collectionIds : []
			});

			throw redirect(303, `/admin/promotions/${promotion.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create promotion") });
		}
	}
};
