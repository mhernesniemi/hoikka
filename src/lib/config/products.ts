import type { ProductType } from "$lib/types.js";

/**
 * Product types this store sells (subset of the schema enum, which also
 * allows "digital"). The admin type selector only renders when there is
 * more than one, so DEFAULT_PRODUCT_TYPE must be one of these.
 */
export const PRODUCT_TYPES: ProductType[] = ["physical"];

/**
 * Default product type for newly created products.
 */
export const DEFAULT_PRODUCT_TYPE: ProductType = "physical";
