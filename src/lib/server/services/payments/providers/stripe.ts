/**
 * Stripe Payment Provider
 * Real Stripe integration using the Stripe SDK
 */
import type { PaymentProvider, PaymentInfo, PaymentStatus, RefundInfo } from "../types.js";
import type { OrderWithRelations } from "$lib/types.js";
import Stripe from "stripe";
import { env } from "$env/dynamic/private";

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe | null {
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

export class StripeProvider implements PaymentProvider {
	code = "stripe";

	/**
	 * Create a Stripe PaymentIntent
	 * Returns clientSecret for Stripe Elements integration
	 */
	async createPayment(order: OrderWithRelations): Promise<PaymentInfo> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		const paymentIntent = await stripe.paymentIntents.create({
			amount: order.total,
			currency: order.currencyCode.toLowerCase(),
			metadata: {
				orderId: order.id.toString(),
				orderCode: order.code
			},
			automatic_payment_methods: {
				enabled: true
			}
		});

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
	 * Confirm payment status by checking Stripe PaymentIntent
	 */
	async confirmPayment(transactionId: string): Promise<PaymentStatus> {
		const stripe = getStripe();
		if (!stripe) {
			throw new Error("Stripe is not configured");
		}

		const paymentIntent = await stripe.paymentIntents.retrieve(transactionId);

		if (paymentIntent.status === "succeeded") {
			return "settled";
		} else if (
			paymentIntent.status === "canceled" ||
			paymentIntent.status === "requires_payment_method"
		) {
			return "declined";
		}
		return "pending";
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
