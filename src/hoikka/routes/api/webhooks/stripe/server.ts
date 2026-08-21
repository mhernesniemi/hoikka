/**
 * Stripe webhook — the authoritative signal that a payment succeeded.
 *
 * The browser also calls `completeOrder` after confirming on the client, but
 * that call is best-effort UX: a closed tab or a dropped connection must not
 * leave a charged order unfulfilled. Both paths run the same idempotent
 * `completeCheckout`, and the order state machine's compare-and-swap makes
 * sure only one of them actually transitions the order.
 *
 * Signature verification uses the raw request body — never the parsed JSON.
 */
import { error, json, text } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "$env/dynamic/private";
import { db } from "@hoikka/core/server/db/index";
import { payments } from "@hoikka/core/server/db/schema";
import { orderService, paymentService } from "@hoikka/core/server/services/index";
import { completeCheckout } from "@hoikka/core/server/services/checkout-completion";
import { getStripe } from "@hoikka/core/server/services/payments/providers/stripe";
import { readTextCapped } from "@hoikka/core/server/http";
import type { RequestHandler } from "@sveltejs/kit";

/** Stripe events are kilobytes; this is generous for the largest of them. */
const MAX_EVENT_BYTES = 1024 * 1024;

/**
 * Returns false when Stripe should redeliver — an incomplete fulfilment is
 * worth another attempt, and redelivery is the only retry this path gets.
 */
async function fulfilIntent(intentId: string): Promise<boolean> {
	const [payment] = await db
		.select()
		.from(payments)
		.where(eq(payments.transactionId, intentId))
		.limit(1);

	if (!payment) {
		console.warn("[stripe-webhook] no_payment_for_intent", { intentId });
		return true; // nothing here to retry
	}

	const order = await orderService.getById(payment.orderId);
	if (!order) {
		console.warn("[stripe-webhook] no_order_for_payment", { paymentId: payment.id });
		return true;
	}

	// A payment *we* voided (order total changed, method switched) that Stripe
	// nonetheless captured: the customer has been charged for something this
	// order is not going to use. Never silently swallow it. A gateway decline
	// is not this case — a shopper who retries a failed card on the same intent
	// settles it, and that has to be allowed through to fulfilment.
	if (payment.state === "cancelled") {
		console.error("[stripe-webhook] duplicate_charge", {
			orderId: order.id,
			paymentId: payment.id,
			intentId,
			amount: payment.amount
		});
		await orderService.setFulfillmentIssue(
			order.id,
			"settlement",
			`Stripe captured ${(payment.amount / 100).toFixed(2)} ${order.currencyCode} on a superseded payment (${intentId}). This charge needs refunding.`
		);
		return true; // recorded — redelivery would not add anything
	}

	const result = await completeCheckout({
		order,
		payment,
		customerId: order.customerId ?? null,
		saveToAddressBook: false
	});

	if (!result.completed) {
		// The charge succeeded but the order could not be completed (stock gone,
		// total changed under it). Surface it as a fulfilment failure rather
		// than losing it — someone has to refund or fix the order.
		console.error("[stripe-webhook] completion_failed", {
			orderId: order.id,
			paymentId: payment.id,
			error: result.error
		});
		await orderService.setFulfillmentIssue(
			order.id,
			"settlement",
			`Stripe reported a successful payment but the order could not be completed: ${result.error}`
		);
		return false;
	}

	// completeCheckout marks the order paid, then fulfils. If fulfilment did
	// not finish, ask Stripe to send the event again rather than leaving a
	// paid order half-delivered.
	const settled = await orderService.getById(order.id);
	return !!settled?.fulfilledAt;
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret) {
		console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting");
		error(503, "Stripe webhooks are not configured");
	}

	const stripe = getStripe();
	if (!stripe) error(503, "Stripe is not configured");

	const signature = request.headers.get("stripe-signature");
	if (!signature) error(400, "Missing stripe-signature header");

	// The signature can only be checked once the body has been read, so the body
	// is unauthenticated input at this point. Content-Length is a claim, not a
	// fact — a client can declare a small body and stream a large one — so the
	// header is only a cheap early reject and the real limit is enforced while
	// reading. Raw bytes either way: parsing first would break the signature.
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (declaredLength > MAX_EVENT_BYTES) error(413, "Payload too large");

	const payload = await readTextCapped(request, MAX_EVENT_BYTES);
	if (payload === null) error(413, "Payload too large");

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
	} catch (err) {
		console.warn("[stripe-webhook] invalid_signature", { error: (err as Error).message });
		error(400, "Invalid signature");
	}

	switch (event.type) {
		// With manual capture the shopper's confirmation lands here, not on
		// succeeded: the money is held, and completing the order is what
		// releases it. Driving completion from this event is what makes
		// fulfilment independent of the browser coming back.
		case "payment_intent.amount_capturable_updated":
		case "payment_intent.succeeded": {
			const done = await fulfilIntent((event.data.object as Stripe.PaymentIntent).id);
			if (!done) {
				// 500 asks Stripe to redeliver with its own backoff
				error(500, "Fulfilment incomplete — please redeliver");
			}
			break;
		}
		case "payment_intent.payment_failed":
		case "payment_intent.canceled": {
			const intent = event.data.object as Stripe.PaymentIntent;
			const [payment] = await db
				.select()
				.from(payments)
				.where(eq(payments.transactionId, intent.id))
				.limit(1);
			if (payment) await paymentService.confirmPayment(payment.id);
			break;
		}
		default:
			// Everything else is acknowledged and ignored.
			break;
	}

	return json({ received: true });
};

// Stripe pings the endpoint with GET during setup in some tooling.
export const GET: RequestHandler = async () => text("ok");
