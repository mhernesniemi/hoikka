/**
 * Product Store (Client-side only)
 *
 * Caches all public products for instant client-side search, filtering,
 * and facet counting — no server round-trips after initial load.
 *
 * Usage:
 *   import { productStore } from "$lib/stores/products.svelte";
 *   productStore.sync(serverProducts);
 *   productStore.search({ search: "shirt", facets: { color: ["red"] }, page: 1, limit: 12 });
 */

import type { CachedProduct, ProductSortKey } from "$lib/types";

let products = $state<CachedProduct[]>([]);
let loaded = $state(false);

function matchesSearch(product: CachedProduct, query: string): boolean {
	const q = query.toLowerCase();
	if (product.name.toLowerCase().includes(q)) return true;
	if (product.description?.toLowerCase().includes(q)) return true;
	return false;
}

function matchesFacets(product: CachedProduct, facets: Record<string, string[]>): boolean {
	// AND between facets, OR within a facet
	for (const [facetCode, valueCodes] of Object.entries(facets)) {
		if (valueCodes.length === 0) continue;
		const productValues = product.facets[facetCode];
		if (!productValues) return false;
		const productCodes = productValues.map((v) => v.code);
		if (!valueCodes.some((code) => productCodes.includes(code))) return false;
	}
	return true;
}

function scopeAndFilter(opts: {
	productIds?: number[];
	search?: string;
	facets?: Record<string, string[]>;
}): CachedProduct[] {
	const { productIds, search, facets } = opts;

	let result: CachedProduct[] = products;

	// Scope to specific product IDs (for categories/collections)
	if (productIds) {
		const idSet = new Set(productIds);
		result = result.filter((p) => idSet.has(p.id));
	}

	if (search && search.trim()) {
		const query = search.trim();
		result = result.filter((p) => matchesSearch(p, query));
	}

	if (facets && Object.keys(facets).length > 0) {
		result = result.filter((p) => matchesFacets(p, facets));
	}

	return result;
}

const sortFns: Record<ProductSortKey, (a: CachedProduct, b: CachedProduct) => number> = {
	newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
	"price-asc": (a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0),
	"price-desc": (a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0),
	"name-asc": (a, b) => a.name.localeCompare(b.name),
	"name-desc": (a, b) => b.name.localeCompare(a.name)
};

export const productStore = {
	get products() {
		return products;
	},
	get loaded() {
		return loaded;
	},

	sync(serverProducts: CachedProduct[]) {
		products = serverProducts;
		loaded = true;
	},

	/**
	 * Search and paginate products client-side.
	 * Pass productIds to scope to a subset (e.g. category or collection).
	 */
	search(opts: {
		productIds?: number[];
		search?: string;
		facets?: Record<string, string[]>;
		sort?: ProductSortKey;
		page?: number;
		limit?: number;
	}): { items: CachedProduct[]; total: number } {
		const { sort = "newest", page = 1, limit = 12 } = opts;
		const filtered = [...scopeAndFilter(opts)].sort(sortFns[sort]);
		const offset = (page - 1) * limit;
		return {
			items: filtered.slice(offset, offset + limit),
			total: filtered.length
		};
	},

	/**
	 * Compute facet value counts for the current filter state.
	 *
	 * Uses disjunctive faceting: for each facet group, counts are computed
	 * with that group's own filter removed so users can see alternatives.
	 * Cross-group filters (AND) are still applied.
	 */
	getFacetCounts(opts: {
		productIds?: number[];
		search?: string;
		facets?: Record<string, string[]>;
	}): Record<string, { code: string; name: string; count: number }[]> {
		const { facets: activeFacets, ...baseOpts } = opts;

		// Collect all facet codes that exist in the product set (unfiltered by facets)
		const baseProducts = scopeAndFilter(baseOpts);
		const allFacetCodes = new Set<string>();
		for (const product of baseProducts) {
			for (const facetCode of Object.keys(product.facets)) {
				allFacetCodes.add(facetCode);
			}
		}

		const result: Record<string, { code: string; name: string; count: number }[]> = {};

		for (const facetCode of allFacetCodes) {
			// For this group, apply all OTHER group filters but exclude this group's filter
			const otherFacets: Record<string, string[]> = {};
			if (activeFacets) {
				for (const [code, values] of Object.entries(activeFacets)) {
					if (code !== facetCode && values.length > 0) {
						otherFacets[code] = values;
					}
				}
			}

			const filtered =
				Object.keys(otherFacets).length > 0
					? scopeAndFilter({ ...baseOpts, facets: otherFacets })
					: baseProducts;

			const valueMap = new Map<string, { name: string; count: number }>();
			for (const product of filtered) {
				const values = product.facets[facetCode];
				if (!values) continue;
				for (const val of values) {
					const existing = valueMap.get(val.code);
					if (existing) {
						existing.count++;
					} else {
						valueMap.set(val.code, { name: val.name, count: 1 });
					}
				}
			}

			if (valueMap.size > 0) {
				result[facetCode] = [...valueMap.entries()].map(([code, { name, count }]) => ({
					code,
					name,
					count
				}));
			}
		}

		return result;
	}
};
