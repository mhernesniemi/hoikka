/**
 * Shared checkout completion path, used by the checkout remote commands (mock
 * payments, Stripe confirmation) and the Stripe webhook: address-book save,
 * final stock check, payment verification, state transitions, shipment +
 * digital delivery, cookie cleanup. The caller navigates to the thank-you page
 * using the returned order code.
 *
 * Completion is fail-closed, resumable and idempotent:
 *
 * - The order only leaves "created" once the gateway has confirmed a settled
 *   payment for exactly the current total, so a pending or declined payment
 *   leaves the draft (and the cart cookies) intact and recoverable.
 * - An order stuck in "payment_pending" (a crash between the two transitions)
 *   is resumed rather than rejected — its payment is re-verified and, if the
 *   money is really there, it is carried through to "paid".
 * - Fulfilment (shipment, download grants, outbox events) is a separate
 *   idempotent step stamped by `orders.fulfilledAt`, which is written in the
 *   same batch as the outbox rows. A crash anywhere before that stamp is
 *   retried; a retry after it does nothing. So an already-paid order still
 *   gets its fulfilment finished when completion is called again.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Cookies } from "@sveltejs/kit";
import { db, atomic } from "../db/index.js";
import { orderLines, orders, productVariants, products } from "../db/schema.js";
import {
	orderService,
	shippingService,
	paymentService,
	isPaymentSuccessful,
	customerService
} from "./index.js";
import { mergeFulfillmentIssue } from "./orders.js";
import { digitalDeliveryService } from "./digitalDelivery.js";
import { pendingEvents } from "../integrations/events.js";
import { CART_COOKIE, CHECKOUT_COOKIE, grantReceipt } from "../cart-cookie.js";
import type { PaymentStatus } from "./payments/types.js";
import type { OrderWithRelations, Payment } from "$lib/types.js";

/** How long one fulfilment attempt may hold its claim before another may retry. */
const FULFILMENT_LEASE_MS = 2 * 60_000;

const SETTLED_STATES = ["paid", "shipped", "delivered"] as const;

/** States in which an order may still be shipped or have downloads granted. */
const FULFILLABLE_STATES: readonly string[] = SETTLED_STATES;

export function isSettledState(state: OrderWithRelations["state"]): boolean {
	return (SETTLED_STATES as readonly string[]).includes(state);
}

export type CompletionResult =
	| { completed: true; orderCode: string }
	| { completed: false; error: string; stockErrors?: string[] };

/**
 * Whether every item in the order is delivered as a download.
 *
 * Prefers what the line was *sold* as over what the product is now. Reading
 * products.type at fulfilment time meant a product flipped from physical to
 * digital after the sale skipped its shipment — with no download to replace it,
 * because nothing had been pinned — and still stamped the order fulfilled.
 * Before a payment exists nothing is pinned yet, so the product's current type
 * is the only answer available and is the right one to use for the checkout UI.
 */
export async function isOrderDigitalOnly(orderId: number): Promise<boolean> {
	const lines = await db
		.select({ soldAs: orderLines.fulfillmentType, productType: products.type })
		.from(orderLines)
		.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(eq(orderLines.orderId, orderId));

	if (lines.length === 0) return false;
	return lines.every((line) => (line.soldAs ?? line.productType) === "digital");
}

function clearCheckoutCookies(cookies?: Cookies): void {
	cookies?.delete(CART_COOKIE, { path: "/" });
	cookies?.delete(CHECKOUT_COOKIE, { path: "/" });
}

export async function completeCheckout(opts: {
	order: OrderWithRelations;
	payment: Payment;
	customerId: number | null;
	saveToAddressBook: boolean;
	/** Absent for server-initiated completion (webhooks), which has no browser. */
	cookies?: Cookies;
}): Promise<CompletionResult> {
	const { payment, customerId, saveToAddressBook, cookies } = opts;

	// Re-read the order: the caller's copy may predate a cart, promotion or
	// shipping change, and every check below is about the *current* total.
	const order = await orderService.getById(opts.order.id);
	if (!order) return { completed: false, error: "Order not found" };

	if (payment.orderId !== order.id) {
		return { completed: false, error: "Payment does not belong to this order" };
	}

	// Already paid: finish any fulfilment a previous attempt did not get to,
	// then report the same success. This is the path a browser retry, a Stripe
	// webhook redelivery, or a resumed crash takes.
	if (isSettledState(order.state)) {
		return finishCompletedOrder(order, cookies);
	}

	if (order.state === "cancelled") {
		// Cancelled before this attempt got here. Whatever hold the shopper's
		// card is under has to come off — cancelPayment leaves an already
		// captured payment alone, and that case is a refund for a human.
		const wasCaptured = payment.state === "settled";
		await paymentService.cancelPayment(payment.id);
		if (wasCaptured) {
			await orderService.setFulfillmentIssue(
				order.id,
				"settlement",
				"Order was cancelled after the payment was captured. Refund required."
			);
		}
		return {
			completed: false,
			error: wasCaptured
				? "This order was cancelled. Our team has been notified about your payment."
				: "This order was cancelled. You have not been charged."
		};
	}

	// "created" (normal) or "payment_pending" (a crash mid-settlement — the
	// money may well be captured, so re-verify and carry it through).
	const resuming = order.state === "payment_pending";

	const isDigitalOnly = await isOrderDigitalOnly(order.id);

	// Save address to the customer's address book if requested
	if (saveToAddressBook && customerId && !isDigitalOnly && order.shippingStreetLine1) {
		try {
			await customerService.addAddress(customerId, {
				fullName: order.shippingFullName || undefined,
				streetLine1: order.shippingStreetLine1,
				city: order.shippingCity || "",
				postalCode: order.shippingPostalCode || "",
				country: order.shippingCountry || "FI",
				isDefault: false
			});
		} catch (e) {
			console.error("Error saving address to address book:", e);
			// Don't fail the order if address book save fails
		}
	}

	// Deliverability, re-checked here and not only when the payment was created.
	// Snapshotting rather than reading: a line that was already pinned keeps its
	// file no matter what has happened to the product since, and one that was
	// not gets pinned now — so the check and everything downstream agree, rather
	// than being separated by the gateway roundtrip that follows.
	const { undeliverable } = await digitalDeliveryService.snapshotDeliverables(order.id);
	if (undeliverable.length > 0) {
		const wasCaptured = payment.state === "settled";
		console.error("[order] undeliverable_at_settlement", {
			orderId: order.id,
			products: undeliverable
		});
		await paymentService.cancelPayment(payment.id);
		if (wasCaptured) {
			await orderService.setFulfillmentIssue(
				order.id,
				"settlement",
				`Captured payment for ${undeliverable.join(", ")}, which has no downloadable file. Refund required.`
			);
		}
		return {
			completed: false,
			error: wasCaptured
				? `${undeliverable.join(", ")} is no longer available. Our team has been notified about your payment.`
				: `${undeliverable.join(", ")} is no longer available. You have not been charged.`
		};
	}

	// Final stock validation (skip for digital products). Failing here means the
	// order will not go through, so any hold the shopper's card is under has to
	// come off with it — cancelPayment leaves an already-captured payment alone.
	if (!isDigitalOnly && !resuming) {
		const stockCheck = await orderService.validateStock(order.id);
		if (!stockCheck.valid) {
			const wasCaptured = payment.state === "settled";
			await paymentService.cancelPayment(payment.id);
			return {
				completed: false,
				error: wasCaptured
					? "Some items are no longer available in the requested quantity. Our team has been notified about your payment."
					: "Some items are no longer available in the requested quantity. You have not been charged.",
				stockErrors: stockCheck.errors
			};
		}
	}

	// The payment must cover exactly what the order costs now. A payment
	// created before the cart/promotion/shipping changed is voided rather than
	// honoured — the shopper starts a fresh one for the new total.
	if (payment.amount !== order.total) {
		console.warn("[order] payment_amount_mismatch", {
			orderId: order.id,
			paymentId: payment.id,
			paymentAmount: payment.amount,
			orderTotal: order.total
		});
		await paymentService.cancelPayment(payment.id);
		return {
			completed: false,
			error: "The order total changed — please start the payment again"
		};
	}

	const verification = await paymentService.confirmPayment(payment.id);

	// Cross-check what the gateway itself reports against this order. Providers
	// that don't report amounts (the mock) leave these undefined and rely on
	// the payment/order check above.
	const mismatch =
		(verification.amount !== undefined && verification.amount !== order.total) ||
		(verification.currency !== undefined &&
			verification.currency !== order.currencyCode.toLowerCase()) ||
		(verification.orderId !== undefined && verification.orderId !== order.id);

	if (mismatch) {
		console.error("[order] payment_verification_mismatch", {
			orderId: order.id,
			paymentId: payment.id,
			orderTotal: order.total,
			currency: order.currencyCode.toLowerCase(),
			verification
		});
		return {
			completed: false,
			error: "The payment could not be verified against this order"
		};
	}

	// Two shapes of "the money is there": authorised (Stripe, which we capture
	// ourselves once the order is committed) and already settled (the mock, and
	// any re-run after a capture that succeeded).
	const authorised = verification.status === "authorized";
	if (!authorised && !isPaymentSuccessful(verification.status)) {
		// Leave the order — and the cookies — exactly as they were so the
		// shopper can retry or pick another method. A resuming order stays in
		// payment_pending, which the admin order page shows as needing a look.
		console.warn("[order] payment_not_settled", {
			orderId: order.id,
			paymentId: payment.id,
			state: order.state,
			status: verification.status
		});
		return {
			completed: false,
			error:
				verification.status === "declined"
					? "The payment was declined. Please try another payment method."
					: "The payment has not completed yet. Please wait a moment and try again."
		};
	}

	// Commit our side first. Inventory and promotion capacity are enforced by
	// database triggers inside this transaction, so it can genuinely fail — and
	// while the payment is only *authorised*, failing here costs the customer
	// nothing: the authorisation is voided and no charge ever appears.
	try {
		await advanceToPaid(order.id);
	} catch (e) {
		const detail = (e as Error).message;

		// Before voiding anything: did another request (the webhook racing the
		// browser) commit this order in the meantime? Both hold the same
		// PaymentIntent, so cancelling on a stale read would pull the
		// authorisation out from under the request that actually won.
		const current = await orderService.getById(order.id);
		if (current && isSettledState(current.state)) {
			console.log("[order] committed_concurrently", { orderId: order.id });
			return finishCompletedOrder(current, cookies);
		}
		if (current?.state === "payment_pending") {
			console.warn("[order] settlement_in_progress_elsewhere", { orderId: order.id });
			return {
				completed: false,
				error: "Your payment is still being confirmed. Please wait a moment and refresh."
			};
		}

		if (current?.state === "cancelled") {
			// Cancelled underneath us. Release the hold — nothing was captured,
			// because capture only ever happens after this point.
			console.warn("[order] cancelled_during_settlement", { orderId: order.id });
			await paymentService.cancelPayment(payment.id);
			return {
				completed: false,
				error: "This order was cancelled. You have not been charged."
			};
		}

		console.error("[order] settlement_failed", {
			orderId: order.id,
			authorised,
			error: detail
		});

		if (authorised) {
			// Nothing was taken. Void the hold and let the shopper start again.
			await paymentService.cancelPayment(payment.id);
			return {
				completed: false,
				error: "Your order could not be completed — an item sold out while you were paying. You have not been charged."
			};
		}

		// Already captured (a provider without a separate capture step). The
		// money is real and the order is not; that needs a person.
		await orderService.setFulfillmentIssue(
			order.id,
			"settlement",
			`Payment settled but the order could not be completed: ${detail}`
		);
		return {
			completed: false,
			error: "Your payment went through but the order could not be completed — an item sold out while you were paying. Our team has been notified and will be in touch."
		};
	}

	// Order committed — now take the money. Nothing is shipped, granted or
	// emailed until that succeeds: an authorisation only reserves funds, and
	// fulfilling against one would give the goods away for money that may never
	// arrive. ensureFulfilled enforces the same rule for every other caller.
	const captured = await ensureCaptured(order.id, verification.status);

	// Every outcome is handled by name. `captured` is an object, so testing it
	// for truthiness compiles perfectly and is always true — which is how a
	// cancelled order once reached the success path below.
	if (!captured.ok && captured.reason === "not-fulfillable") {
		// The order stopped being a sale while the payment was in flight.
		// Anything that was taken has already been given back.
		return {
			completed: false,
			error: "This order was cancelled while your payment was being processed. You have not been charged."
		};
	}

	console.log("[order] completed", {
		orderId: order.id,
		total: order.total,
		customerId,
		isDigitalOnly,
		resumed: resuming,
		captured: captured.ok
	});

	// A capture that merely failed leaves the order standing — the shopper
	// placed it, the problem is recorded, and the next attempt retries the
	// capture. Fulfilment still waits for the money.
	if (captured.ok) await ensureFulfilled(order.id);

	// The cart and the draft are done — clear both cookies, and hand the
	// browser the capability that lets it read this one receipt back.
	grantReceipt(cookies, order.checkoutToken);
	clearCheckoutCookies(cookies);

	return { completed: true, orderCode: order.code };
}

/**
 * Move a committed order from wherever it is to "paid", skipping any step
 * another request already made. Two completions for the same order routinely
 * overlap (the webhook and the browser), and re-issuing a transition that has
 * already happened is not an error worth voiding a payment over.
 */
export async function advanceToPaid(orderId: number): Promise<void> {
	const before = await orderService.getById(orderId);
	if (before?.state === "created") {
		await orderService.transitionState(orderId, "payment_pending");
	}

	const midway = await orderService.getById(orderId);
	if (midway?.state === "payment_pending") {
		await orderService.transitionState(orderId, "paid");
	}

	// Assert the destination rather than assuming it. Skipping a step another
	// request already took is fine; ending up somewhere else entirely is not —
	// an administrator cancelling the order while the gateway roundtrip was in
	// flight would otherwise look like success here, and the caller would go on
	// to capture the money and ship a cancelled order whose stock was never
	// deducted.
	const after = await orderService.getById(orderId);
	if (after?.state !== "paid") {
		throw new Error(
			`Order ${orderId} could not be marked paid — it is ${after?.state ?? "missing"}`
		);
	}
}

/**
 * Make sure the money is actually taken, not merely held.
 *
 * Authorisations expire, so an order committed against one is not finished
 * until it is captured. This is idempotent: a payment already settled is a
 * no-op, and a capture that fails is recorded on the order and reported as
 * false so the caller withholds fulfilment.
 */
export type CaptureOutcome =
	/** Money is captured and the order may be fulfilled. */
	| { ok: true }
	/** The order is no longer a sale; nothing is owed and nothing was kept. */
	| { ok: false; reason: "not-fulfillable" }
	/** The order stands, the money is not in yet, and a retry may fix it. */
	| { ok: false; reason: "capture-failed" };

export async function ensureCaptured(
	orderId: number,
	/**
	 * The gateway's verdict if the caller has just asked for it, to save a
	 * roundtrip on the happy path. Omit it and the gateway is asked here.
	 */
	knownStatus?: PaymentStatus
): Promise<CaptureOutcome> {
	// The order can be cancelled between being committed and being captured —
	// an admin acting while the gateway roundtrip is in flight. Cancelling
	// restores the stock, so capturing afterwards would charge for goods the
	// store has already given back.
	const order = await orderService.getById(orderId);
	if (!order || !FULFILLABLE_STATES.includes(order.state)) {
		// Release whatever is still holding the shopper's money — cancelPayment
		// leaves an already-captured payment alone, and that case is a refund
		// for a human rather than something to void here.
		const held = await paymentService.getPrimaryForOrder(orderId);
		if (held) {
			console.warn("[order] not_fulfillable_before_capture", {
				orderId,
				state: order?.state,
				payment: held.state
			});
			await paymentService.cancelPayment(held.id);
		}
		return { ok: false, reason: "not-fulfillable" };
	}

	const payment = await paymentService.getPrimaryForOrder(orderId);
	if (!payment) return { ok: false, reason: "capture-failed" };
	if (payment.state === "settled") return { ok: true };

	// Dead ends: nothing the gateway says will make these capturable.
	if (payment.state === "declined" || payment.state === "cancelled") {
		return { ok: false, reason: "capture-failed" };
	}
	if (payment.state === "refunded") {
		return { ok: false, reason: "not-fulfillable" };
	}
	// "pending" and "authorized" both mean "ask the gateway" — the local row is
	// the last thing we heard, not necessarily the current truth.

	// The local row can lag the gateway. A crash between a successful capture
	// and the local write leaves us recording "authorized" for money that is
	// already taken; capturing again would be rejected, and treating that
	// rejection as failure would strand a charged order forever. So the gateway
	// is asked first, and asked again if the capture errors.
	let status = knownStatus;
	if (status === undefined) {
		status = (await paymentService.confirmPayment(payment.id)).status;
	}
	if (isPaymentSuccessful(status)) {
		await orderService.setFulfillmentIssue(orderId, "settlement", null);
		return { ok: true };
	}
	if (status !== "authorized") {
		await recordCaptureProblem(orderId, `payment is ${status}, not capturable`);
		return { ok: false, reason: "capture-failed" };
	}

	try {
		const captured = await paymentService.capturePayment(payment.id);
		if (!isPaymentSuccessful(captured.status)) {
			throw new Error(`capture returned ${captured.status}`);
		}

		// The capture is a call to somebody else's system, and the order can be
		// cancelled while it is in flight — restoring the stock this money was
		// meant to pay for. Checking before was not enough; the money is now
		// real, so it has to go back rather than sit as a note for a human.
		const settledOrder = await orderService.getById(orderId);
		if (!settledOrder || !FULFILLABLE_STATES.includes(settledOrder.state)) {
			return await refundCaptureOnDeadOrder(orderId, payment.id, settledOrder?.state);
		}

		await orderService.setFulfillmentIssue(orderId, "settlement", null);
		return { ok: true };
	} catch (e) {
		const detail = (e as Error).message;

		// "Capture failed" and "capture succeeded but we never heard" look the
		// same from here, so ask the gateway what actually happened before
		// declaring the money missing.
		const reconciled = await paymentService.confirmPayment(payment.id).catch(() => null);
		if (reconciled && isPaymentSuccessful(reconciled.status)) {
			console.warn("[order] capture_reconciled", { orderId, detail });
			const settledOrder = await orderService.getById(orderId);
			if (!settledOrder || !FULFILLABLE_STATES.includes(settledOrder.state)) {
				return await refundCaptureOnDeadOrder(orderId, payment.id, settledOrder?.state);
			}
			await orderService.setFulfillmentIssue(orderId, "settlement", null);
			return { ok: true };
		}

		console.error("[order] capture_failed", { orderId, error: detail });
		await recordCaptureProblem(orderId, detail);
		return { ok: false, reason: "capture-failed" };
	}
}

/**
 * Give back money captured for an order that stopped being a sale while the
 * gateway call was in flight. Automatic, because the alternative is a customer
 * charged for a cancelled order waiting on someone to notice a note.
 */
async function refundCaptureOnDeadOrder(
	orderId: number,
	paymentId: number,
	state: string | undefined
): Promise<CaptureOutcome> {
	console.error("[order] captured_after_cancellation", { orderId, state });

	try {
		await paymentService.refundPayment(paymentId);
		await orderService.setFulfillmentIssue(
			orderId,
			"settlement",
			`Payment was captured just as the order became ${state ?? "unavailable"}, and has been refunded automatically.`
		);
	} catch (e) {
		await orderService.setFulfillmentIssue(
			orderId,
			"settlement",
			`Payment was captured but the order is ${state ?? "unavailable"} and the automatic refund failed (${(e as Error).message}). Refund it manually.`
		);
	}

	return { ok: false, reason: "not-fulfillable" };
}

/**
 * The order stands and the authorisation may still be valid — this is goods
 * owed rather than money taken, so it is recorded for a human and retried by
 * the next completion attempt.
 */
async function recordCaptureProblem(orderId: number, detail: string): Promise<void> {
	await orderService.setFulfillmentIssue(
		orderId,
		"settlement",
		`Payment was authorised but not captured (${detail}). Capture or void it in the payment provider.`
	);
}

/**
 * Hand an already-completed order back to the browser: make sure fulfilment
 * finished, grant the receipt capability, and clear the cart. Called both from
 * `completeCheckout` and directly by the checkout command when a payment
 * webhook won the race — without this the shopper's own request would 404 on a
 * draft that no longer exists and they would never see their order.
 */
export async function finishCompletedOrder(
	order: OrderWithRelations,
	cookies?: Cookies
): Promise<CompletionResult> {
	// A committed order can still be waiting on its capture — a crash between
	// the two leaves exactly that. Retry it here before fulfilling anything.
	const captured = await ensureCaptured(order.id);

	if (!captured.ok && captured.reason === "not-fulfillable") {
		// Cancelled or refunded out from under this order. Reporting success
		// here would hand out a receipt for a sale that no longer exists.
		return {
			completed: false,
			error: "This order is no longer active. If you were charged, the payment has been refunded."
		};
	}

	if (captured.ok) await ensureFulfilled(order.id);

	grantReceipt(cookies, order.checkoutToken);
	clearCheckoutCookies(cookies);
	return { completed: true, orderCode: order.code };
}

/**
 * Everything that happens *after* the money is captured: shipment, download
 * grants, and the outbox events other systems react to.
 *
 * Runs at most once per order and is safe to call again after any crash. The
 * `fulfilledAt` stamp is written in the same batch as the outbox rows, so the
 * events can neither be lost (stamp without rows) nor duplicated (rows without
 * stamp). Everything before that batch is individually idempotent.
 */
export async function ensureFulfilled(
	orderId: number
): Promise<{ fulfilled: boolean; errors: string[] }> {
	const order = await orderService.getById(orderId);
	if (!order) return { fulfilled: false, errors: ["Order not found"] };
	if (order.fulfilledAt) return { fulfilled: true, errors: [] };

	// A cancelled order has had its stock put back; shipping it or granting its
	// downloads now would hand over goods the store no longer accounts for.
	// Checked here rather than only in the caller so no route — an admin retry,
	// a webhook redelivery — can get around it.
	if (!FULFILLABLE_STATES.includes(order.state)) {
		const payment = await paymentService.getPrimaryForOrder(orderId);
		if (payment?.state === "settled") {
			await orderService.setFulfillmentIssue(
				orderId,
				"settlement",
				`Order is ${order.state} but its payment was captured. Refund required.`
			);
		}
		return { fulfilled: false, errors: [`Order is ${order.state} — fulfilment withheld`] };
	}

	// Never hand over goods against money that is only reserved, or that has
	// already gone back to the customer. Callers should have captured first;
	// this is the backstop for every other route.
	const payment = await paymentService.getPrimaryForOrder(orderId);
	if (payment && payment.state !== "settled") {
		return {
			fulfilled: false,
			errors: [`Payment is ${payment.state}, not captured — fulfilment withheld`]
		};
	}

	// Claim the work before doing any of it: a webhook and a browser callback
	// routinely arrive at the same moment, and both running would create two
	// shipments and enqueue the delivery email twice. The claim is a lease
	// rather than a flag, so a crash mid-fulfilment is picked up again once it
	// expires instead of leaving the order stuck forever.
	const leaseFrom = new Date(Date.now() - FULFILMENT_LEASE_MS);
	const claim = new Date();
	const [claimed] = await db
		.update(orders)
		.set({ fulfillmentClaimedAt: claim })
		.where(
			and(
				eq(orders.id, orderId),
				isNull(orders.fulfilledAt),
				or(isNull(orders.fulfillmentClaimedAt), lt(orders.fulfillmentClaimedAt, leaseFrom))
			)
		)
		.returning({ id: orders.id });

	if (!claimed) {
		// Someone else has it. Report what is true right now; if they finish,
		// the next caller (or a webhook redelivery) sees fulfilledAt set.
		const current = await orderService.getById(orderId);
		return current?.fulfilledAt
			? { fulfilled: true, errors: [] }
			: { fulfilled: false, errors: ["Fulfilment is already in progress"] };
	}

	const isDigitalOnly = await isOrderDigitalOnly(orderId);

	// Two very different kinds of failure. A transient one (the shipping
	// provider is down, the database blipped) deserves another attempt, so the
	// order is left unstamped and the caller retries. A permanent one — a
	// digital product with no file — cannot be fixed by trying again; it is
	// recorded on the order for a human and fulfilment moves on, so the rest of
	// the order still ships and the buyer still gets told.
	// Kept per source rather than in one bag: each is cleared independently, so
	// they must not be lumped together and filed under whichever label happens
	// to sort first.
	const transient: string[] = [];
	const shipmentProblems: string[] = [];
	const downloadProblems: string[] = [];

	if (!isDigitalOnly) {
		// No method chosen at all is a permanent problem (checkout requires one,
		// so this means the order was built another way) — retrying cannot
		// invent a rate. A provider that errors, on the other hand, is worth
		// another go.
		if (!(await shippingService.getOrderShipping(order.id))) {
			shipmentProblems.push("No shipping method was set on this order");
		} else {
			try {
				// Writes tracking onto the existing order_shipping row —
				// re-running overwrites rather than duplicating.
				await shippingService.createShipment(order);
			} catch (e) {
				console.error("Error creating shipment:", e);
				transient.push(`Shipment could not be created: ${(e as Error).message}`);
			}
		}
	}

	// Download grants are keyed by order line, so this converges on retry.
	let digitalGrants = 0;
	try {
		const grants = await digitalDeliveryService.createGrants(orderId);
		digitalGrants = grants.granted;
		downloadProblems.push(...grants.errors);
	} catch (e) {
		console.error("Error creating download grants:", e);
		transient.push(`Downloads could not be prepared: ${(e as Error).message}`);
	}

	const shipmentIssue = shipmentProblems.join("; ") || null;
	const downloadIssue = downloadProblems.join("; ") || null;
	const permanent = [...shipmentProblems, ...downloadProblems];

	if (transient.length > 0) {
		// Release the claim so the retry does not have to wait out the lease —
		// but only if it is still ours, or we would be releasing a replacement's.
		await db
			.update(orders)
			.set({
				fulfillmentClaimedAt: null,
				fulfillmentError: mergeFulfillmentIssue(
					mergeFulfillmentIssue(order.fulfillmentError, "shipment", shipmentIssue),
					"downloads",
					downloadIssue
				)
			})
			.where(and(eq(orders.id, orderId), eq(orders.fulfillmentClaimedAt, claim)));
		return { fulfilled: false, errors: [...transient, ...permanent] };
	}

	// Stamp and enqueue together: one batch, so a crash cannot separate them —
	// and every statement is conditional on this worker still holding the claim
	// it took. A worker whose lease expired, whose replacement finished the job,
	// and which then wakes up must write nothing at all; otherwise it would
	// enqueue a second order.paid and a second delivery email.
	// A predicate that selects *this* order row and no other — pendingEvents
	// turns it into INSERT ... SELECT ... FROM orders WHERE <this>, so it must
	// match at most one row.
	const stillOurs = and(
		eq(orders.id, orderId),
		eq(orders.fulfillmentClaimedAt, claim),
		isNull(orders.fulfilledAt)
	)!;

	await atomic([
		...pendingEvents(
			[
				...(digitalGrants > 0
					? [{ type: "order.digital_delivery", payload: { orderId }, maxAttempts: 8 }]
					: []),
				{
					type: "order.paid",
					payload: {
						code: order.code,
						total: order.total,
						customerEmail: order.customerEmail,
						isDigitalOnly
					},
					maxAttempts: 5
				}
			],
			stillOurs
		),
		db
			.update(orders)
			.set({
				fulfilledAt: new Date(),
				fulfillmentError: mergeFulfillmentIssue(
					mergeFulfillmentIssue(order.fulfillmentError, "shipment", null),
					"downloads",
					downloadIssue
				)
			})
			.where(
				and(
					eq(orders.id, orderId),
					eq(orders.fulfillmentClaimedAt, claim),
					isNull(orders.fulfilledAt)
				)
			)
	]);

	// If the claim was stolen and the replacement finished first, none of the
	// batch applied — report the truth rather than a fulfilment we did not do.
	const after = await orderService.getById(orderId);
	return { fulfilled: !!after?.fulfilledAt, errors: permanent };
}
