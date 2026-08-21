import { asc, desc, type SQL } from "drizzle-orm";
import type { PaginationInfo } from "@hoikka/core/shared/types";

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

/**
 * Resolve a whitelisted sortBy key into a directional orderBy expression.
 * Falls back to `fallback` when sortBy is missing or not in the map;
 * omit `fallback` to get undefined instead (for multi-column default sorts).
 */
export function resolveSort(
	sortColumnMap: Record<string, SQL>,
	sortBy: string | undefined,
	sortOrder: "asc" | "desc",
	fallback: SQL
): SQL;
export function resolveSort(
	sortColumnMap: Record<string, SQL>,
	sortBy: string | undefined,
	sortOrder: "asc" | "desc"
): SQL | undefined;
export function resolveSort(
	sortColumnMap: Record<string, SQL>,
	sortBy: string | undefined,
	sortOrder: "asc" | "desc",
	fallback?: SQL
): SQL | undefined {
	const sortCol =
		(sortBy && Object.hasOwn(sortColumnMap, sortBy) ? sortColumnMap[sortBy] : undefined) ??
		fallback;
	return sortCol && (sortOrder === "asc" ? asc(sortCol) : desc(sortCol));
}

/** Pagination block for a PaginatedResult. */
export function paginationOf(
	total: number,
	limit: number,
	offset: number,
	itemsLength: number
): PaginationInfo {
	return { total, limit, offset, hasMore: offset + itemsLength < total };
}
