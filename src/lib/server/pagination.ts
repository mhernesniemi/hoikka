export function parsePaginationParams(url: URL, pageSize = 20) {
	const page = Number(url.searchParams.get("page")) || 1;
	return {
		search: url.searchParams.get("search") || undefined,
		sortBy: url.searchParams.get("sort") || undefined,
		sortOrder: (url.searchParams.get("order") as "asc" | "desc") || undefined,
		page,
		limit: pageSize,
		offset: (page - 1) * pageSize
	};
}
