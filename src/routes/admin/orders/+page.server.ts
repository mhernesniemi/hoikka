import { parsePaginationParams } from "$lib/server/pagination.js";
import { orderService } from "$lib/server/services/orders.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const state = url.searchParams.get("state") as string | undefined;
	const { search, sortBy, sortOrder, page, limit, offset } = parsePaginationParams(url);

	const result = await orderService.listPaginated({
		state: state as any,
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
