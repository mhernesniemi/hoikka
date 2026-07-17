// Shared FormData parsing for the promotion create/edit actions. The two
// actions have different empty-value semantics on purpose: create passes
// `undefined` for absent optional fields (service defaults apply), while
// update passes `null` (clear the stored value).

function optionalNumber<E extends null | undefined>(
	data: FormData,
	name: string,
	empty: E
): number | E {
	const value = data.get(name);
	return value ? Number(value) : empty;
}

function optionalDate<E extends null | undefined>(
	data: FormData,
	name: string,
	empty: E
): Date | E {
	const value = data.get(name);
	return value ? new Date(value as string) : empty;
}

function parseCommon(data: FormData) {
	return {
		combinesWithOtherPromotions: data.get("combinesWithOtherPromotions") === "on",
		customerGroupId: data.get("customerGroupId") ? Number(data.get("customerGroupId")) : null,
		// Product/collection IDs come from JSON hidden fields
		productIds: (data.get("productIds")
			? JSON.parse(data.get("productIds") as string)
			: []) as number[],
		collectionIds: (data.get("collectionIds")
			? JSON.parse(data.get("collectionIds") as string)
			: []) as number[]
	};
}

export function parsePromotionCreateForm(data: FormData) {
	return {
		...parseCommon(data),
		method: (data.get("method") as "code" | "automatic") ?? "code",
		code: data.get("code") as string,
		title: data.get("title") as string,
		promotionType: data.get("promotionType") as "order" | "product" | "free_shipping",
		discountType: data.get("discountType") as "percentage" | "fixed_amount",
		discountValueRaw: Number(data.get("discountValue")),
		appliesTo: data.get("appliesTo") as "all" | "specific_products" | "specific_collections",
		minOrderAmountRaw: optionalNumber(data, "minOrderAmount", undefined),
		usageLimit: optionalNumber(data, "usageLimit", undefined),
		usageLimitPerCustomer: optionalNumber(data, "usageLimitPerCustomer", undefined),
		startsAt: optionalDate(data, "startsAt", undefined),
		endsAt: optionalDate(data, "endsAt", undefined)
	};
}

export function parsePromotionUpdateForm(data: FormData) {
	return {
		...parseCommon(data),
		title: data.has("title") ? (data.get("title") as string) || null : undefined,
		discountType: data.get("discountType") as "percentage" | "fixed_amount" | null,
		discountValueRaw: data.get("discountValue") ? Number(data.get("discountValue")) : undefined,
		appliesTo: data.get("appliesTo") as
			"all" | "specific_products" | "specific_collections" | null,
		minOrderAmountRaw: optionalNumber(data, "minOrderAmount", null),
		usageLimit: optionalNumber(data, "usageLimit", null),
		usageLimitPerCustomer: optionalNumber(data, "usageLimitPerCustomer", null),
		startsAt: optionalDate(data, "startsAt", null),
		endsAt: optionalDate(data, "endsAt", null),
		enabled: data.get("enabled") === "on"
	};
}
