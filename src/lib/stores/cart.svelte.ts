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
let cart = $state<OrderWithRelations | null>(null);

export const cartStore = {
	// UI state
	get isOpen() {
		return isOpen;
	},
	get isLoading() {
		return isLoading;
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

	// Sync from server (called by layout)
	sync(serverCart: OrderWithRelations | null) {
		cart = serverCart;
	},

	// Optimistic updates
	updateLineQuantity(lineId: number, quantity: number) {
		if (!cart) return;
		let newLines;
		if (quantity <= 0) {
			newLines = cart.lines.filter((l) => l.id !== lineId);
		} else {
			newLines = cart.lines.map((l) => {
				if (l.id !== lineId) return l;
				const unitTax = l.quantity > 0 ? Math.round(l.taxAmount / l.quantity) : 0;
				return {
					...l,
					quantity,
					lineTotal: l.unitPrice * quantity,
					taxAmount: unitTax * quantity,
					lineTotalNet: l.unitPrice * quantity - unitTax * quantity
				};
			});
		}
		const newSubtotal = newLines.reduce((sum, l) => sum + l.lineTotal, 0);
		const newTaxTotal = newLines.reduce((sum, l) => sum + l.taxAmount, 0);
		const newTotal = newSubtotal - (cart.discount ?? 0) + (cart.shipping ?? 0);
		cart = {
			...cart,
			lines: newLines,
			subtotal: newSubtotal,
			total: newTotal,
			taxTotal: cart.isTaxExempt ? 0 : newTaxTotal
		};
	},

	removeLine(lineId: number) {
		if (!cart) return;
		const newLines = cart.lines.filter((l) => l.id !== lineId);
		const newSubtotal = newLines.reduce((sum, l) => sum + l.lineTotal, 0);
		const newTaxTotal = newLines.reduce((sum, l) => sum + l.taxAmount, 0);
		const newTotal = newSubtotal - (cart.discount ?? 0) + (cart.shipping ?? 0);
		cart = {
			...cart,
			lines: newLines,
			subtotal: newSubtotal,
			total: newTotal,
			taxTotal: cart.isTaxExempt ? 0 : newTaxTotal
		};
	}
};
