/**
 * Settlement: the path an order takes from draft to paid, shared by the
 * checkout remote commands, the Stripe webhook, and every recovery route.
 *
 *   created ──verify payment──▶ payment_pending ──commit*──▶ paid
 *      │                             │                         │
 *      │  verify fails: draft        │  capacity abort:        │  capture fails:
 *      │  and cookies untouched      │  cancel + refund        │  order stands,
 *      ▼                             ▼                         │  fulfilment
 *   (retryable)                  cancelled                     │  withheld
 *                                                              ▼
 *                                              ensureFulfilled (fulfillment.ts)
 *
 * *commit is one transaction: order state + inventory + promotion usage,
 *  capacity enforced by database triggers.
 *
 * Fail-closed, resumable, idempotent:
 * - The order only leaves "created" once the gateway has confirmed a payment
 *   for exactly the current total.
 * - A crash mid-settlement (payment_pending) or between capture and its local
 *   write is resumed by re-asking the gateway, never by trusting local state.
 * - Money captured for a sale that cannot go ahead is refunded automatically
 *   (refundDeadSale); with STRIPE_MANUAL_CAPTURE the same race loss only
 *   voids a hold.
 * - Fulfilment is a separate capture-gated step in fulfillment.ts.
 */
import type { Cookies } from "@sveltejs/kit";
import config from "$hoikka/config";
import { orderService, paymentService, isPaymentSuccessful, customerService } from "./index.js";
import { isFulfillableState, isSettledState } from "./order-utils.js";
import { ensureFulfilled, isOrderDigitalOnly } from "./fulfillment.js";
import { digitalDeliveryService } from "./digitalDelivery.js";
import { CART_COOKIE, CHECKOUT_COOKIE, grantReceipt } from "../cart-cookie.js";
import type { PaymentStatus } from "./payments/types.js";
import type { OrderWithRelations, Payment } from "@hoikka/core/shared/types";

export type CompletionResult =
	| { completed: true; orderCode: string }
	| { completed: false; error: string; stockErrors?: string[] };

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
	const { customerId, saveToAddressBook, cookies } = opts;

	// Re-read both: the caller's copies may predate a cart change or a payment
	// state transition, and every "was this captured?" decision below has to be
	// made against what is true now, not what the caller last saw.
	const order = await orderService.getById(opts.order.id);
	if (!order) return { completed: false, error: "Order not found" };
	const payment = await paymentService.getById(opts.payment.id);
	if (!payment) return { completed: false, error: "Payment not found" };

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
			const refunded = await refundDeadSale(
				order.id,
				payment.id,
				"Order was cancelled after the payment was captured."
			);
			return {
				completed: false,
				error: deadSaleMessage("This order was cancelled.", refunded)
			};
		}
		return {
			completed: false,
			error: "This order was cancelled. You have not been charged."
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
				country: order.shippingCountry || config.countries.default,
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
			const refunded = await refundDeadSale(
				order.id,
				payment.id,
				`Captured payment for ${undeliverable.join(", ")}, which has no downloadable file.`
			);
			return {
				completed: false,
				error: deadSaleMessage(
					`${undeliverable.join(", ")} is no longer available.`,
					refunded
				)
			};
		}
		return {
			completed: false,
			error: `${undeliverable.join(", ")} is no longer available. You have not been charged.`
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
			if (wasCaptured) {
				const refunded = await refundDeadSale(
					order.id,
					payment.id,
					"Items sold out before the order could be completed."
				);
				return {
					completed: false,
					error: deadSaleMessage(
						"Some items are no longer available in the requested quantity.",
						refunded
					),
					stockErrors: stockCheck.errors
				};
			}
			return {
				completed: false,
				error: "Some items are no longer available in the requested quantity. You have not been charged.",
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
			// Two very different reasons to land here. A capacity abort (the
			// stock or promotion trigger) means *this* order lost the race after
			// its own first transition — waiting will never fix it, so resolve
			// it: cancel the order and give any captured money back. Anything
			// else means another request for the same order is mid-settlement,
			// and waiting is exactly right.
			if (isCapacityAbort(detail)) {
				try {
					await orderService.transitionState(order.id, "cancelled");
				} catch (cancelError) {
					console.error("[order] dead_sale_cancel_failed", {
						orderId: order.id,
						error: (cancelError as Error).message
					});
				}
				// confirmPayment above may have just persisted "settled"
				const paymentNow = (await paymentService.getById(payment.id)) ?? payment;
				if (paymentNow.state === "settled") {
					const refunded = await refundDeadSale(
						order.id,
						payment.id,
						`Order lost a capacity race mid-settlement: ${detail}.`
					);
					return {
						completed: false,
						error: deadSaleMessage(
							"An item sold out while you were paying, so your order could not be completed.",
							refunded
						)
					};
				}
				await paymentService.cancelPayment(payment.id);
				return {
					completed: false,
					error: "An item sold out while you were paying, so your order could not be completed. You have not been charged."
				};
			}

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

		// Already captured (automatic capture, or a provider without a separate
		// capture step). The money is real and the order is not — give it back.
		const refunded = await refundDeadSale(
			order.id,
			payment.id,
			`Payment settled but the order could not be committed: ${detail}.`
		);
		return {
			completed: false,
			error: deadSaleMessage(
				"An item sold out while you were paying, so your order could not be completed.",
				refunded
			)
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
	if (!order || !isFulfillableState(order.state)) {
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
		if (!settledOrder || !isFulfillableState(settledOrder.state)) {
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
			if (!settledOrder || !isFulfillableState(settledOrder.state)) {
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
 * Whether a settlement failure was one of our own capacity triggers — the
 * fixed abort strings from migrations 0008-0010. Those failures are final for
 * this order; retrying or waiting cannot conjure the capacity back.
 */
function isCapacityAbort(detail: string): boolean {
	return (
		detail.includes("stock cannot go negative") ||
		detail.includes("promotion usage limit reached") ||
		detail.includes("promotion already used by this customer")
	);
}

/**
 * Money was captured for a sale that cannot go ahead. Send it back rather than
 * leaving a note: a customer charged for nothing must not wait on somebody
 * reading the admin panel. With automatic capture (the Stripe default here)
 * this is the standard way a lost stock or promotion race resolves. Returns
 * whether the refund actually went through; a failure is flagged for a human.
 */
async function refundDeadSale(orderId: number, paymentId: number, why: string): Promise<boolean> {
	console.error("[order] refunding_dead_sale", { orderId, paymentId, why });

	try {
		await paymentService.refundPayment(paymentId);
		await orderService.setFulfillmentIssue(
			orderId,
			"settlement",
			`${why} The captured payment has been refunded automatically.`
		);
		return true;
	} catch (e) {
		await orderService.setFulfillmentIssue(
			orderId,
			"settlement",
			`${why} The automatic refund failed (${(e as Error).message}) — refund it manually.`
		);
		return false;
	}
}

/**
 * The customer-facing sentence for a dead sale, honest about the money.
 */
function deadSaleMessage(context: string, refunded: boolean): string {
	return refunded
		? `${context} Your payment has been refunded.`
		: `${context} Our team has been notified about your payment.`;
}

async function refundCaptureOnDeadOrder(
	orderId: number,
	paymentId: number,
	state: string | undefined
): Promise<CaptureOutcome> {
	await refundDeadSale(
		orderId,
		paymentId,
		`Payment was captured just as the order became ${state ?? "unavailable"}.`
	);
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
			error: "This order is no longer active and cannot be completed. If a charge was made, it is being returned — contact us if it has not appeared within a few days."
		};
	}

	if (captured.ok) await ensureFulfilled(order.id);

	grantReceipt(cookies, order.checkoutToken);
	clearCheckoutCookies(cookies);
	return { completed: true, orderCode: order.code };
}
