/**
 * Product type settings, derived from hoikka.config.ts — edit the config, not
 * this file. Declaring more than one product type there makes the admin's
 * type selector appear.
 */
import config from "$hoikka/config";
import type { ProductType } from "$lib/types.js";

export const PRODUCT_TYPES = Object.keys(config.productTypes) as ProductType[];
export const DEFAULT_PRODUCT_TYPE = config.defaultProductType as ProductType;
