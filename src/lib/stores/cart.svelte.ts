/**
 * Cart sheet UI state (client-side only).
 *
 * Cart data itself comes from the `getCart` remote query in
 * $lib/remote/cart.remote.ts — this store tracks whether the sheet is open
 * and whether a cart mutation is in flight, so the sheet can hold steady UI
 * (last known totals, no empty-state flash) while commands run.
 * The `.svelte.ts` extension enables Svelte 5 runes.
 */

let isOpen = $state(false);
let pendingOps = $state(0);

export const cartStore = {
	get isOpen() {
		return isOpen;
	},
	/** True while any tracked cart mutation is in flight */
	get isBusy() {
		return pendingOps > 0;
	},
	open() {
		isOpen = true;
	},
	close() {
		isOpen = false;
	},
	toggle() {
		isOpen = !isOpen;
	},
	/** Run a cart mutation with the sheet aware it's in flight */
	async track<T>(action: () => Promise<T>): Promise<T> {
		pendingOps++;
		try {
			return await action();
		} finally {
			pendingOps--;
		}
	}
};
