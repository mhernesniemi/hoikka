/**
 * Cart Store (Client-side only)
 *
 * This file uses the `.svelte.ts` extension to enable Svelte 5 runes ($state).
 * Regular `.ts` files cannot use runes - you'll get "rune_outside_svelte" error.
 *
 * This store manages:
 * - Cart sheet UI state (open/close)
 * - Cart data with optimistic updates for instant UI feedback
 *
 * Usage:
 *   import { cartStore } from "$lib/stores/cart.svelte";
 *   cartStore.open();  // Opens the cart sheet
 *   cartStore.close(); // Closes it
 *   cartStore.updateLineQuantity(lineId, 2); // Optimistic quantity update
 *
 * Note: This is CLIENT-SIDE state. Don't try to call from server code.
 */

import type { OrderWithRelations } from "$lib/types";

let isOpen = $state(false);
let isLoading = $state(false);
let isUpdating = $state(false);
let cart = $state<OrderWithRelations | null>(null);

export const cartStore = {
	// UI state
	get isOpen() {
		return isOpen;
	},
	get isLoading() {
		return isLoading;
	},
	get isUpdating() {
		return isUpdating;
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
	setLoading(loading: boolean) {
		isLoading = loading;
	},

	// Cart data
	get cart() {
		return cart;
	},
	get itemCount() {
		return cart?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;
	},

	// Sync from server (called by layout) — always authoritative
	sync(serverCart: OrderWithRelations | null) {
		cart = serverCart;
		isUpdating = false;
	},

	// Optimistic line updates — lines update instantly for snappy UX,
	// but totals are NOT recalculated (footer shows spinner until server responds)
	updateLineQuantity(lineId: number, quantity: number) {
		if (!cart) return;
		isUpdating = true;
		const newLines =
			quantity <= 0
				? cart.lines.filter((l) => l.id !== lineId)
				: cart.lines.map((l) =>
						l.id !== lineId ? l : { ...l, quantity, lineTotal: l.unitPrice * quantity }
					);
		cart = { ...cart, lines: newLines };
	},

	removeLine(lineId: number) {
		if (!cart) return;
		isUpdating = true;
		cart = { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
	}
};
