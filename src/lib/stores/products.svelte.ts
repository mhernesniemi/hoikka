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

import type { CachedProduct } from "$lib/types";

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

function filterProducts(
	all: CachedProduct[],
	search?: string,
	facets?: Record<string, string[]>
): CachedProduct[] {
	let result = all;

	if (search && search.trim()) {
		const query = search.trim();
		result = result.filter((p) => matchesSearch(p, query));
	}

	if (facets && Object.keys(facets).length > 0) {
		result = result.filter((p) => matchesFacets(p, facets));
	}

	return result;
}

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
	 */
	search(opts: {
		search?: string;
		facets?: Record<string, string[]>;
		page?: number;
		limit?: number;
	}): { items: CachedProduct[]; total: number } {
		const { search, facets, page = 1, limit = 12 } = opts;
		const filtered = filterProducts(products, search, facets);
		const offset = (page - 1) * limit;
		return {
			items: filtered.slice(offset, offset + limit),
			total: filtered.length
		};
	},

	/**
	 * Compute facet value counts for the current filter state.
	 * Returns Record<facetCode, { code, name, count }[]>.
	 */
	getFacetCounts(opts: {
		search?: string;
		facets?: Record<string, string[]>;
	}): Record<string, { code: string; name: string; count: number }[]> {
		const { search, facets: activeFacets } = opts;
		const filtered = filterProducts(products, search, activeFacets);

		const counts: Record<string, Map<string, { name: string; count: number }>> = {};

		for (const product of filtered) {
			for (const [facetCode, values] of Object.entries(product.facets)) {
				if (!counts[facetCode]) {
					counts[facetCode] = new Map();
				}
				for (const val of values) {
					const existing = counts[facetCode].get(val.code);
					if (existing) {
						existing.count++;
					} else {
						counts[facetCode].set(val.code, { name: val.name, count: 1 });
					}
				}
			}
		}

		const result: Record<string, { code: string; name: string; count: number }[]> = {};
		for (const [facetCode, valueMap] of Object.entries(counts)) {
			result[facetCode] = [...valueMap.entries()]
				.map(([code, { name, count }]) => ({ code, name, count }))
				.sort((a, b) => b.count - a.count);
		}

		return result;
	}
};
