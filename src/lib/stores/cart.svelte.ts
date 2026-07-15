/**
 * Cart sheet UI state (client-side only).
 *
 * Cart data itself comes from the `getCart` remote query in
 * $lib/remote/cart.remote.ts — this store only tracks whether the sheet is
 * open. The `.svelte.ts` extension enables Svelte 5 runes.
 */

let isOpen = $state(false);

export const cartStore = {
	get isOpen() {
		return isOpen;
	},
	open() {
		isOpen = true;
	},
	close() {
		isOpen = false;
	},
	toggle() {
		isOpen = !isOpen;
	}
};
