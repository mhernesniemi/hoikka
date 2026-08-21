/**
 * Header search-as-you-type. A remote query over the server FTS5 index —
 * results are ranked and the catalog never ships to the client.
 */

import * as v from "valibot";
import { quickSearchProducts } from "@hoikka/core/server/services/product-search";

export const quickSearchSchema = v.pipe(v.string(), v.maxLength(100));

export const quickSearch = async (term: v.InferOutput<typeof quickSearchSchema>) =>
	quickSearchProducts(term);
