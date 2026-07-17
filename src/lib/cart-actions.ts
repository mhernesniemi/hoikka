/**
 * Client-side cart actions: one call per user intent, optimistic UI wired
 * in. Pages stay thin — they call these and render the outcome.
 */
import { addToCart, getCart } from "$lib/remote/cart.remote";
import { cartStore } from "$lib/stores/cart.svelte";
import { withAddedLine, type OptimisticLineSeed } from "$lib/cart-optimistic";
import type { ProductWithRelations } from "$lib/types";

type Variant = ProductWithRelations["variants"][number];

/** What the cart sheet needs to show a line before the server confirms it */
export function optimisticSeed(
	product: ProductWithRelations,
	variant: Variant
): OptimisticLineSeed {
	return {
		variantId: variant.id,
		productId: product.id,
		productName: product.name,
		variantName: product.variants.length > 1 ? (variant.name ?? variant.sku) : null,
		imageUrl: variant.imageUrl ?? product.featuredAsset?.source ?? null,
		unitPrice: variant.effectivePrice ?? variant.price
	};
}

/**
 * Add a variant to the cart with an optimistic sheet update: the line shows
 * in the same frame, the command's single-flight refresh replaces it with
 * the server cart, and errors roll the override back automatically.
 * Tracked in cartStore so the sheet holds steady UI while in flight.
 */
export async function addVariantToCart(seed: OptimisticLineSeed, quantity: number): Promise<void> {
	await cartStore.track(() =>
		addToCart({ variantId: seed.variantId, quantity }).updates(
			getCart().withOverride((cart) => (cart ? withAddedLine(cart, seed, quantity) : cart))
		)
	);
}
