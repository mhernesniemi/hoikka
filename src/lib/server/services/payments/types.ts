/**
 * Payment Provider Interface and Types
 * Defines the contract for payment providers (Stripe, PayPal, Klarna, etc.)
 */
import type { OrderWithRelations } from "$lib/types.js";

export interface PaymentProvider {
	code: string; // unique code like 'stripe', 'paypal'

	/**
	 * Whether the provider may be offered and charged on this deployment.
	 * Providers without credentials — or test-only providers outside
	 * development — return false and are hidden from checkout entirely.
	 * Omitted means "always available".
	 */
	isAvailable?: () => boolean;

	createPayment: (order: OrderWithRelations) => Promise<PaymentInfo>;
	/**
	 * Ask the gateway what actually happened. Returns the amount and currency
	 * the gateway settled, so the caller can refuse to fulfil an order whose
	 * total no longer matches what was charged.
	 */
	confirmPayment?: (paymentId: string) => Promise<PaymentVerification>;
	/**
	 * Capture money the shopper has already authorised. Providers that separate
	 * the two let the store commit its own invariants — inventory, promotion
	 * capacity — *before* the customer is actually charged.
	 */
	capturePayment?: (paymentId: string) => Promise<PaymentVerification>;
	/** Void an unsettled payment (e.g. when the order total changed). */
	cancelPayment?: (paymentId: string) => Promise<void>;
	refundPayment?: (paymentId: string, amount?: number) => Promise<RefundInfo>;
}

export type PaymentInfo = {
	providerTransactionId: string;
	clientSecret?: string; // For Stripe Elements / frontend integration
	redirectUrl?: string; // For PayPal / Klarna redirect flows
	metadata?: Record<string, unknown>;
};

/** What the gateway reports for a transaction. */
export type PaymentVerification = {
	status: PaymentStatus;
	/** Amount the gateway holds/captured, in minor units. */
	amount?: number;
	/** Lowercase ISO currency code the gateway used. */
	currency?: string;
	/** Order id recorded with the transaction when it was created. */
	orderId?: number;
};

// Payment status values must match the database enum. Providers only ever
// report the first four and "refunded"; "cancelled" is ours, set when we void
// a payment that may never be honoured (see PaymentService.cancelPayment).
export type PaymentStatus =
	"pending" | "authorized" | "settled" | "declined" | "cancelled" | "refunded";

// Statuses that indicate a successful/captured payment
const SUCCESSFUL_STATUSES: PaymentStatus[] = ["settled"];

/**
 * Check if a payment status indicates successful payment capture
 */
export function isPaymentSuccessful(status: PaymentStatus): boolean {
	return SUCCESSFUL_STATUSES.includes(status);
}

export type RefundInfo = {
	refundedAmount: number; // Amount in cents
	refundId?: string;
	metadata?: Record<string, unknown>;
};
