/**
 * Post-payment fulfilment: shipment, download grants, and the outbox events
 * other systems react to. Runs only against captured money, at most once per
 * order, behind a lease so concurrent attempts (a webhook racing a browser)
 * cannot duplicate its side effects. See checkout-completion.ts for how an
 * order gets here.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, atomic } from "../db/index.js";
import { orderLines, orders, productVariants, products } from "../db/schema.js";
import { orderService, shippingService, paymentService } from "./index.js";
import { mergeFulfillmentIssue } from "./orders.js";
import { isFulfillableState } from "./order-utils.js";
import { digitalDeliveryService } from "./digitalDelivery.js";
import { pendingEvents } from "../integrations/events.js";

/** How long one fulfilment attempt may hold its claim before another may retry. */
const FULFILMENT_LEASE_MS = 2 * 60_000;

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
	if (!isFulfillableState(order.state)) {
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
			{ orderId, claimedAt: claim }
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
