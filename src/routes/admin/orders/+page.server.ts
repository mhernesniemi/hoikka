import { parsePaginationParams } from "$lib/server/pagination.js";
import { orderService } from "$lib/server/services/orders.js";
import type { OrderState } from "$lib/types.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const state = (url.searchParams.get("state") ?? undefined) as OrderState | undefined;
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await orderService.listPaginated({
		state,
		limit,
		offset,
		search,
		sortBy,
		sortOrder
	});

	return {
		orders: result.items,
		pagination: result.pagination,
		currentState: state,
		currentPage: page
	};
};
