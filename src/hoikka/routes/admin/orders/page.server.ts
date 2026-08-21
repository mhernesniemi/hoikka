import { parsePaginationParams } from "@hoikka/core/server/pagination";
import { orderService } from "@hoikka/core/server/services/orders";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ url }: ServerLoadEvent) => {
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
