/**
 * Stripe Payment Provider
 * Real Stripe integration using the Stripe SDK
 */
import type { PaymentProvider, PaymentInfo, PaymentVerification, RefundInfo } from "../types.js";
import type { OrderWithRelations } from "$lib/types.js";
import Stripe from "stripe";
import { env } from "$env/dynamic/private";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe | null {
	if (!stripeInstance) {
		const secretKey = env.STRIPE_SECRET_KEY;
		if (!secretKey) {
			console.error("[stripe] STRIPE_SECRET_KEY is not set — payments are disabled");
			return null;
		}
		stripeInstance = new Stripe(secretKey);
	}
	return stripeInstance;
}

/**
 * Map a PaymentIntent status onto our payment states.
 *
 * The subtle one is `requires_payment_method`: after a card is refused Stripe
 * puts the intent back into that state so the shopper can supply another one,
 * and the same intent then settles. Recording it as a decline would strand an
 * order that is about to be paid, so only a cancelled intent is final.
 */
export function paymentStatusForIntent(
	intentStatus: Stripe.PaymentIntent.Status
): PaymentVerification["status"] {
	switch (intentStatus) {
		case "succeeded":
			return "settled";
		case "requires_capture":
			return "authorized";
		case "canceled":
			return "declined";
		default:
			// requires_payment_method, requires_confirmation, requires_action,
			// processing — all still on their way somewhere.
			return "pending";
	}
}

export class StripeProvider implements PaymentProvider {
	code = "stripe";

	constructor(private options: { manualCapture?: boolean } = {}) {}

	isAvailable(): boolean {
		return !!env.STRIPE_SECRET_KEY;
	}

	/**
	 * Create a Stripe PaymentIntent
	 * Returns clientSecret for Stripe Elements integration
	 */
	async createPayment(order: OrderWithRelations): Promise<PaymentInfo> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		// Idempotency key = order + financial revision. Two concurrent "start
		// payment" requests for the same order and total therefore get the same
		// intent back from Stripe instead of creating two chargeable ones; any
		// change to the money bumps the revision and yields a fresh intent.
		const paymentIntent = await stripe.paymentIntents.create(
			{
				amount: order.total,
				currency: order.currencyCode.toLowerCase(),
				// STRIPE_MANUAL_CAPTURE=true authorises on confirmation and
				// captures only once the order is committed, so losing a stock
				// race voids a hold instead of refunding a charge. The default
				// is automatic capture: manual capture makes Stripe exclude
				// payment methods that don't support it (iDEAL, Bancontact,
				// SEPA debit, ...) from the Payment Element, and holds expire
				// after ~7 days. With automatic capture the same race loss is
				// handled by an automatic refund instead (see refundDeadSale in
				// checkout-completion.ts).
				capture_method:
					env.STRIPE_MANUAL_CAPTURE === "true" || this.options.manualCapture
						? "manual"
						: "automatic",
				metadata: {
					orderId: order.id.toString(),
					orderCode: order.code,
					paymentRevision: String(order.paymentRevision)
				},
				automatic_payment_methods: {
					enabled: true
				}
			},
			{ idempotencyKey: `hoikka-order-${order.id}-rev-${order.paymentRevision}` }
		);

		return {
			providerTransactionId: paymentIntent.id,
			clientSecret: paymentIntent.client_secret!,
			metadata: {
				paymentIntentId: paymentIntent.id,
				status: paymentIntent.status
			}
		};
	}

	/**
	 * Confirm payment status by checking Stripe PaymentIntent. Reports the
	 * amount, currency and order the intent was created for so the caller can
	 * check them against the order it is about to fulfil.
	 */
	async confirmPayment(transactionId: string): Promise<PaymentVerification> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		const paymentIntent = await stripe.paymentIntents.retrieve(transactionId);

		const status = paymentStatusForIntent(paymentIntent.status);

		const metadataOrderId = Number(paymentIntent.metadata?.orderId);

		return {
			status,
			// amount_received is what actually landed; fall back to the intent
			// amount for statuses where nothing has been captured yet.
			amount: status === "settled" ? paymentIntent.amount_received : paymentIntent.amount,
			currency: paymentIntent.currency,
			orderId: Number.isFinite(metadataOrderId) ? metadataOrderId : undefined
		};
	}

	/**
	 * Take the money the shopper authorised. Called only once the order has
	 * been committed, so a capture failure leaves goods owed rather than money
	 * taken for nothing.
	 */
	async capturePayment(transactionId: string): Promise<PaymentVerification> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		const intent = await stripe.paymentIntents.capture(transactionId);
		return {
			status: paymentStatusForIntent(intent.status),
			amount: intent.amount_received,
			currency: intent.currency,
			orderId: Number(intent.metadata?.orderId) || undefined
		};
	}

	/**
	 * Void an intent that is no longer valid (e.g. the order total changed
	 * before the customer paid, or the order could not be committed).
	 */
	async cancelPayment(transactionId: string): Promise<void> {
		const stripe = getStripe();
		if (!stripe) return;
		try {
			await stripe.paymentIntents.cancel(transactionId);
		} catch (error) {
			// Already captured or already cancelled — nothing left to void.
			console.warn("[stripe] cancel_failed", {
				transactionId,
				error: (error as Error).message
			});
		}
	}

	/**
	 * Refund a payment via Stripe
	 */
	async refundPayment(transactionId: string, amount?: number): Promise<RefundInfo> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		const refund = await stripe.refunds.create({
			payment_intent: transactionId,
			amount: amount ?? undefined
		});

		return {
			refundedAmount: refund.amount,
			refundId: refund.id,
			metadata: {
				status: refund.status,
				created: refund.created
			}
		};
	}
}
