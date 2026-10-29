/**
 * Product type settings, derived from hoikka.config.ts — edit the config, not
 * this file. Declaring more than one product type there makes the admin's
 * type selector appear.
 */
import config from "#hoikka/config";
import type { Fulfillment } from "#lib/config-schema/types.js";

export const PRODUCT_TYPES = Object.entries(config.productTypes).map(([key, def]) => ({
	key,
	label: def.label
}));
export const DEFAULT_PRODUCT_TYPE = config.defaultProductType;

/** How a product of this type is delivered, also for a type since removed from the config. */
export function fulfillmentOf(type: string): Fulfillment {
	return config.productTypes[type]?.fulfillment ?? (type === "digital" ? "digital" : "physical");
}
