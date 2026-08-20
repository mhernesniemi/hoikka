/**
 * Pure order calculation functions
 * No database or environment dependencies
 */

import type { OrderState } from "$lib/types.js";

// Valid state transitions
export const STATE_TRANSITIONS: Record<OrderState, OrderState[]> = {
	created: ["payment_pending", "cancelled"],
	payment_pending: ["paid", "cancelled"],
	paid: ["shipped", "cancelled"],
	shipped: ["delivered"],
	delivered: [],
	cancelled: []
};

const SETTLED_STATES: readonly OrderState[] = ["paid", "shipped", "delivered"];

/** The money for this order has been taken and kept. */
export function isSettledState(state: OrderState): boolean {
	return SETTLED_STATES.includes(state);
}

/**
 * Whether an order may still be shipped or have downloads granted. Currently
 * the settled states; kept as its own name because the two questions are
 * different even while the answers coincide.
 */
export function isFulfillableState(state: OrderState): boolean {
	return SETTLED_STATES.includes(state);
}

/**
 * Check if a state transition is valid
 */
export function isValidTransition(currentState: OrderState, newState: OrderState): boolean {
	const allowedTransitions = STATE_TRANSITIONS[currentState];
	return allowedTransitions.includes(newState);
}

/**
 * Get allowed transitions from a given state
 */
export function getAllowedTransitions(currentState: OrderState): OrderState[] {
	return STATE_TRANSITIONS[currentState] ?? [];
}

/**
 * Check if an order state is terminal (no further transitions possible)
 */
export function isTerminalState(state: OrderState): boolean {
	return STATE_TRANSITIONS[state]?.length === 0;
}

/**
 * Check if an order state allows modifications (is still a cart)
 */
export function isModifiableState(state: OrderState): boolean {
	return state === "created";
}

export interface OrderLine {
	lineTotal: number;
	taxAmount: number;
	lineTotalNet: number;
}

export interface AppliedPromotion {
	discountAmount: number;
	type: "order" | "product" | "shipping";
}

export interface OrderTotalsInput {
	lines: OrderLine[];
	appliedPromotions: AppliedPromotion[];
	shipping: number;
	isTaxExempt: boolean;
}

export interface OrderTotals {
	subtotal: number;
	taxTotal: number;
	subtotalNet: number;
	discount: number;
	shipping: number;
	total: number;
	totalNet: number;
}

/**
 * Calculate order totals from lines, promotions, and shipping
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
	const { lines, appliedPromotions, shipping, isTaxExempt } = input;

	const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
	const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
	const subtotalNet = lines.reduce((sum, line) => sum + line.lineTotalNet, 0);

	// Split discounts: order/product discounts apply to subtotal, shipping discounts apply to shipping
	const orderProductDiscount = appliedPromotions
		.filter((op) => op.type === "order" || op.type === "product")
		.reduce((sum, op) => sum + op.discountAmount, 0);
	const shippingDiscount = appliedPromotions
		.filter((op) => op.type === "shipping")
		.reduce((sum, op) => sum + op.discountAmount, 0);

	const discount = orderProductDiscount;
	const effectiveShipping = Math.max(0, shipping - shippingDiscount);

	const total = Math.max(0, subtotal - discount + effectiveShipping);
	// For tax-exempt orders, totalNet equals total (no tax). Otherwise use subtotalNet.
	const totalNet = isTaxExempt ? total : Math.max(0, subtotalNet - discount + effectiveShipping);

	return {
		subtotal,
		taxTotal: isTaxExempt ? 0 : taxTotal,
		subtotalNet,
		discount: discount + shippingDiscount,
		shipping: effectiveShipping,
		total,
		totalNet
	};
}

/**
 * Calculate cart item count from lines
 */
export function calculateCartItemCount(lines: { quantity: number }[]): number {
	return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Check if stock is available for adding items to cart
 */
export function canAddToCart(
	requestedQuantity: number,
	existingQuantity: number,
	availableStock: number
): { allowed: boolean; maxAddable: number } {
	const totalRequested = existingQuantity + requestedQuantity;
	const allowed = totalRequested <= availableStock;
	const maxAddable = Math.max(0, availableStock - existingQuantity);

	return { allowed, maxAddable };
}
