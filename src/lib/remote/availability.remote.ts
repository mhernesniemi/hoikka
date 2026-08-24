/**
 * Availability remote functions. Stock is queried from the browser, never
 * rendered into the HTML: guest product pages are edge-cached per catalog
 * version, and purchases must not invalidate that cache (see
 * $lib/server/services/availability.ts).
 */
import { query } from "$app/server";
import * as v from "valibot";
import {
	getProductAvailability,
	type ProductAvailability
} from "$lib/server/services/availability.js";

export const productAvailability = query(
	v.pipe(v.number(), v.integer(), v.minValue(1)),
	(productId): Promise<ProductAvailability> => getProductAvailability(productId)
);
