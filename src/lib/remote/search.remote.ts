/**
 * Header search-as-you-type. A remote query over the server FTS5 index —
 * results are ranked and the catalog never ships to the client.
 */
import { query } from "$app/server";
import * as v from "valibot";
import { quickSearchProducts } from "$lib/server/services/product-search.js";

export const quickSearch = query(v.pipe(v.string(), v.maxLength(100)), async (term) =>
	quickSearchProducts(term)
);
