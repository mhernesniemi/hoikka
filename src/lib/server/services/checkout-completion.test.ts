/**
 * Integration tests for the money-safety invariants of checkout completion,
 * against a real migrated in-memory SQLite database.
 *
 * The behaviours under test are the ones that decide whether a store can be
 * paid less than it charged: a payment must match the order's current total,
 * a payment the gateway has not settled must never produce a paid order, and
 * completing twice must not fulfil twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
vi.mock("$app/environment", () => ({ dev: true, browser: false, building: false }));

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, atomic } from "../db/index.js";
import {
	orderPromotions,
	orders,
	paymentMethods,
	outbox,
	payments,
	promotions,
	products,
	productVariants,
	stockReservations
} from "../db/schema.js";
import { orderService } from "./orders.js";
import { paymentService } from "./payments/index.js";
import { shippingService } from "./shipping/index.js";
import {
	advanceToPaid,
	completeCheckout,
	ensureCaptured,
	ensureFulfilled,
	finishCompletedOrder,
	isSettledState
} from "./checkout-completion.js";
import { pendingEvents } from "../integrations/events.js";
import type { Cookies } from "@sveltejs/kit";

let counter = 0;

/** Outbox rows mentioning this order — the durable side effects of fulfilment. */
async function countEvents(orderCode: string): Promise<number> {
	const rows = await db.select().from(outbox);
	return rows.filter((row) => JSON.stringify(row.payload).includes(orderCode)).length;
}

async function makeProduct(price: number, stock = 100) {
	// Captured before the first await: two of these run concurrently in the
	// race tests, and reading the shared counter afterwards collides on sku.
	const n = ++counter;
	const [product] = await db
		.insert(products)
		.values({ name: `Product ${n}`, slug: `product-${n}` })
		.returning();
	const [variant] = await db
		.insert(productVariants)
		.values({ productId: product.id, sku: `SKU-${n}`, price, stock })
		.returning();
	return { product, variant };
}

/** A draft order with one line, ready to pay. */
async function makeDraft(price = 5000) {
	const { variant } = await makeProduct(price);
	const { order } = await orderService.startCheckout(
		[{ variantId: variant.id, quantity: 1 }],
		{}
	);

	// A physical order without a shipping method is not a realistic draft —
	// checkout refuses to create a payment for one — and leaving it out makes
	// every fulfilment here record a spurious problem.
	const method = await shippingService.getMethodByCode("flat_rate");
	const [rate] = await shippingService.getAvailableRates((await orderService.getById(order.id))!);
	await shippingService.setShippingMethod(order.id, method!.id, rate.id, rate.price);
	await orderService.updateTotals(order.id);

	return (await orderService.getById(order.id))!;
}

async function mockMethodId(): Promise<number> {
	const method = await paymentService.getMethodByCode("mock");
	return method!.id;
}

/** In-memory stand-in for SvelteKit's Cookies, recording what was removed. */
function fakeCookies(): Cookies & { deleted: string[]; jar: Map<string, string> } {
	const deleted: string[] = [];
	const jar = new Map<string, string>();
	return {
		deleted,
		jar,
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => jar.set(name, value),
		delete: (name: string) => {
			deleted.push(name);
			jar.delete(name);
		}
	} as unknown as Cookies & { deleted: string[]; jar: Map<string, string> };
}

describe("completeCheckout", () => {
	beforeEach(() => {
		counter += 100;
	});

	it("pays an order whose payment matches the total", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		const cookies = fakeCookies();

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(result.completed).toBe(true);
		const paid = await orderService.getById(order.id);
		expect(paid!.state).toBe("paid");
		// Both cart cookies are cleared only on a real success
		expect(cookies.deleted).toHaveLength(2);
	});

	it("refuses to fulfil when the order grew after the payment was created", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		// The order total grows after the (cheaper) payment exists
		await db.update(orders).set({ total: 9900 }).where(eq(orders.id, order.id));

		const cookies = fakeCookies();
		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(result.completed).toBe(false);
		const unchanged = await orderService.getById(order.id);
		expect(unchanged!.state).toBe("created");
		// The draft stays recoverable — nothing is cleared
		expect(cookies.deleted).toHaveLength(0);
		// ...and the stale payment is voided so it can never be reused. Voided is
		// its own state, not "declined": a declined attempt may still be retried.
		const [voided] = await db.select().from(payments).where(eq(payments.id, payment.id));
		expect(voided.state).toBe("cancelled");
	});

	it("leaves the draft alone when the gateway declines", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		// The mock provider declines transactions marked to fail
		await db
			.update(payments)
			.set({ transactionId: "mock_fail_1" })
			.where(eq(payments.id, payment.id));
		const declining = (await paymentService.getById(payment.id))!;

		const cookies = fakeCookies();
		const result = await completeCheckout({
			order,
			payment: declining,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(result.completed).toBe(false);
		expect((await orderService.getById(order.id))!.state).toBe("created");
		expect(cookies.deleted).toHaveLength(0);
	});

	it("is idempotent — a second completion returns the same order without re-paying", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		const first = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});
		const second = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(first).toEqual(second);
		expect((await orderService.getById(order.id))!.state).toBe("paid");
	});

	it("resumes an order stranded in payment_pending with a captured payment", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		// The real crash state: confirmPayment persisted "settled" and the first
		// transition landed, then the process died before "paid".
		await db.update(payments).set({ state: "settled" }).where(eq(payments.id, payment.id));
		await orderService.transitionState(order.id, "payment_pending");

		// The draft is gone, so the browser can only get back in through the
		// token — which is what the checkout loader and completeOrder now do.
		expect(await orderService.getDraftByToken(order.checkoutToken)).toBeNull();
		const byToken = await orderService.getByCheckoutToken(order.checkoutToken);
		expect(byToken!.state).toBe("payment_pending");

		const settledPayment = (await paymentService.getPrimaryForOrder(order.id))!;
		expect(settledPayment.state).toBe("settled");

		const cookies = fakeCookies();
		const result = await completeCheckout({
			order: byToken!,
			payment: settledPayment,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(result.completed).toBe(true);
		const resumed = await orderService.getById(order.id);
		expect(resumed!.state).toBe("paid");
		expect(resumed!.fulfilledAt).not.toBeNull();
		// ...and the shopper gets their receipt capability, not a fresh cart
		expect(cookies.jar.get("receipts")).toContain(order.checkoutToken!);
	});

	it("finishes fulfilment for an order that was paid but never fulfilled", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		// Simulate a crash after "paid" but before fulfilment was stamped: the
		// claim the dead process took is left behind, aged past its lease.
		await db
			.update(orders)
			.set({
				fulfilledAt: null,
				fulfillmentClaimedAt: new Date(Date.now() - 10 * 60_000)
			})
			.where(eq(orders.id, order.id));
		const eventsBefore = await countEvents(order.code);

		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect((await orderService.getById(order.id))!.fulfilledAt).not.toBeNull();
		// The retry emitted the events the crashed run never got to...
		expect(await countEvents(order.code)).toBeGreaterThan(eventsBefore);

		// ...and a further call adds nothing
		const settled = await countEvents(order.code);
		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});
		expect(await countEvents(order.code)).toBe(settled);
	});

	it("lets only one of two simultaneous completions fulfil the order", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		// The browser callback and the payment webhook, arriving together
		const [a, b] = await Promise.all([
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			}),
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			})
		]);

		expect(a.completed).toBe(true);
		expect(b.completed).toBe(true);

		// One order.paid event, not two — fulfilment ran once
		const paidEvents = await db.select().from(outbox);
		const forThisOrder = paidEvents.filter(
			(row) => row.type === "order.paid" && JSON.stringify(row.payload).includes(order.code)
		);
		expect(forThisOrder).toHaveLength(1);
	});

	it("deducts stock once when a webhook and a browser complete together", async () => {
		const { variant } = await makeProduct(5000, 10);
		const { order: created } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 3 }],
			{}
		);
		const method = await shippingService.getMethodByCode("flat_rate");
		const [rate] = await shippingService.getAvailableRates(
			(await orderService.getById(created.id))!
		);
		await shippingService.setShippingMethod(created.id, method!.id, rate.id, rate.price);
		await orderService.updateTotals(created.id);
		const order = (await orderService.getById(created.id))!;
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		await Promise.all([
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			}),
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			})
		]);

		const [after] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variant.id));
		expect(after.stock).toBe(7);
	});

	it("writes nothing from a worker whose lease was stolen", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});
		const eventsAfterFirstRun = await countEvents(order.code);
		expect(eventsAfterFirstRun).toBeGreaterThan(0);

		// The exact batch a worker would run after its lease expired, a
		// replacement finished the job, and it finally woke up: its claim stamp
		// no longer matches the row, so every statement has to miss. Run
		// directly, because by definition this worker is already past the
		// "is it already fulfilled?" check it made when it started.
		const stolenClaim = new Date(Date.now() - 30 * 60_000);
		await atomic(
			pendingEvents(
				[{ type: "order.paid", payload: { code: order.code }, maxAttempts: 5 }],
				and(
					eq(orders.id, order.id),
					eq(orders.fulfillmentClaimedAt, stolenClaim),
					isNull(orders.fulfilledAt)
				)!
			)
		);

		expect(await countEvents(order.code)).toBe(eventsAfterFirstRun);

		// And a worker that *does* still hold the claim writes exactly one
		const liveClaim = new Date();
		await db
			.update(orders)
			.set({ fulfillmentClaimedAt: liveClaim, fulfilledAt: null })
			.where(eq(orders.id, order.id));
		await atomic(
			pendingEvents(
				[{ type: "order.paid", payload: { code: order.code }, maxAttempts: 5 }],
				and(
					eq(orders.id, order.id),
					eq(orders.fulfillmentClaimedAt, liveClaim),
					isNull(orders.fulfilledAt)
				)!
			)
		);
		expect(await countEvents(order.code)).toBe(eventsAfterFirstRun + 1);
	});

	it("short-circuits a late worker that can see the job is already done", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});
		const before = await countEvents(order.code);

		const late = await ensureFulfilled(order.id);

		expect(late.fulfilled).toBe(true);
		expect(await countEvents(order.code)).toBe(before);
	});

	it("hands the completing browser a receipt capability", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		const cookies = fakeCookies();

		await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(cookies.jar.get("receipts")).toContain(order.checkoutToken!);
	});

	it("refuses a payment that belongs to a different order", async () => {
		const orderA = await makeDraft(5000);
		const orderB = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(orderB, await mockMethodId());

		const result = await completeCheckout({
			order: orderA,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(result.completed).toBe(false);
		expect((await orderService.getById(orderA.id))!.state).toBe("created");
	});
});

describe("authorise, commit, then capture", () => {
	/**
	 * A provider that holds the money instead of taking it, the way Stripe does
	 * with manual capture. The point of the sequence is that a commit failure
	 * costs the shopper nothing.
	 */
	function authorisingProvider() {
		const captured: string[] = [];
		const cancelled: string[] = [];
		paymentService.registerProvider({
			code: "auth-test",
			async createPayment() {
				return { providerTransactionId: `auth_${Math.random().toString(36).slice(2)}` };
			},
			async confirmPayment() {
				return { status: "authorized" };
			},
			async capturePayment(id) {
				captured.push(id);
				return { status: "settled" };
			},
			async cancelPayment(id) {
				cancelled.push(id);
			}
		});
		return { captured, cancelled };
	}

	async function authMethodId(): Promise<number> {
		const existing = await paymentService.getMethodByCode("auth-test");
		if (existing) return existing.id;
		const [method] = await db
			.insert(paymentMethods)
			.values({ code: "auth-test", name: "Auth test", active: true })
			.returning();
		return method.id;
	}

	it("captures only after the order is committed", async () => {
		const { captured, cancelled } = authorisingProvider();
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(result.completed).toBe(true);
		expect(captured).toHaveLength(1);
		expect(cancelled).toHaveLength(0);
		expect((await orderService.getById(order.id))!.state).toBe("paid");
		expect((await paymentService.getById(payment.id))!.state).toBe("settled");
	});

	it("does not fulfil until the capture actually succeeds", async () => {
		const failing = {
			captured: [] as string[],
			cancelled: [] as string[]
		};
		paymentService.registerProvider({
			code: "auth-test",
			async createPayment() {
				return { providerTransactionId: `auth_${Math.random().toString(36).slice(2)}` };
			},
			async confirmPayment() {
				return { status: "authorized" };
			},
			async capturePayment() {
				throw new Error("gateway unavailable");
			},
			async cancelPayment(id) {
				failing.cancelled.push(id);
			}
		});

		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		// The order stands — the shopper placed it — but nothing is handed over
		expect(result.completed).toBe(true);
		const after = await orderService.getById(order.id);
		expect(after!.state).toBe("paid");
		expect(after!.fulfilledAt).toBeNull();
		expect(after!.fulfillmentError).toContain("not captured");
		expect(await countEvents(order.code)).toBe(0);

		// ...and no other route can fulfil it while the money is only held
		const forced = await ensureFulfilled(order.id);
		expect(forced.fulfilled).toBe(false);
		expect(forced.errors.join(" ")).toContain("not captured");
	});

	it("captures and fulfils on a later attempt once the gateway recovers", async () => {
		// Same order as above would be ideal, but each test builds its own so
		// the recovery is modelled as a provider that works this time.
		const { captured } = authorisingProvider();
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		// A crash after committing but before capturing
		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		await db.update(payments).set({ state: "authorized" }).where(eq(payments.id, payment.id));

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(result.completed).toBe(true);
		expect(captured).toHaveLength(1);
		expect((await orderService.getById(order.id))!.fulfilledAt).not.toBeNull();
	});

	it("keeps a shared authorisation alive when two completions overlap", async () => {
		const { captured, cancelled } = authorisingProvider();
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		// The browser and the webhook, both holding the same authorisation
		const [a, b] = await Promise.all([
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			}),
			completeCheckout({
				order,
				payment,
				customerId: null,
				saveToAddressBook: false,
				cookies: fakeCookies()
			})
		]);

		expect(a.completed).toBe(true);
		expect(b.completed).toBe(true);
		// The loser must not pull the authorisation out from under the winner
		expect(cancelled).toHaveLength(0);
		expect(captured.length).toBeGreaterThanOrEqual(1);
		expect((await paymentService.getById(payment.id))!.state).toBe("settled");
	});

	it("recovers a capture that succeeded but was never recorded locally", async () => {
		// The durability gap: the gateway took the money, the process died
		// before the local row was updated. Capturing again is rejected, so the
		// only way out is to ask the gateway what it actually thinks.
		let alreadyCaptured = false;
		paymentService.registerProvider({
			code: "auth-test",
			async createPayment() {
				return { providerTransactionId: `auth_${Math.random().toString(36).slice(2)}` };
			},
			async confirmPayment() {
				return { status: alreadyCaptured ? "settled" : "authorized" };
			},
			async capturePayment() {
				if (alreadyCaptured) throw new Error("intent is no longer capturable");
				alreadyCaptured = true;
				return { status: "settled" };
			},
			async cancelPayment() {}
		});

		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		// The order was committed and the gateway took the money, then the
		// process died before the local row was written. The retry arrives on
		// the already-paid path, so nothing re-verifies the payment on its way
		// in — ensureCaptured is on its own here.
		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		await paymentService.capturePayment(payment.id);
		await db.update(payments).set({ state: "authorized" }).where(eq(payments.id, payment.id));
		await db.update(orders).set({ fulfilledAt: null }).where(eq(orders.id, order.id));
		expect(alreadyCaptured).toBe(true);

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		// The charge is recognised rather than retried into a rejection
		expect(result.completed).toBe(true);
		const after = await orderService.getById(order.id);
		expect(after!.state).toBe("paid");
		expect(after!.fulfilledAt).not.toBeNull();
		expect(after!.fulfillmentError).toBeNull();
		expect((await paymentService.getById(payment.id))!.state).toBe("settled");
	});

	it("does not charge or fulfil an order cancelled during confirmation", async () => {
		const { captured, cancelled } = authorisingProvider();
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		// An admin cancels while the gateway roundtrip is in flight
		await orderService.transitionState(order.id, "cancelled");

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(result.completed).toBe(false);
		expect(result.completed === false && result.error).toContain("cancelled");
		expect(captured).toHaveLength(0);
		expect(cancelled).toHaveLength(1);

		const after = await orderService.getById(order.id);
		expect(after!.state).toBe("cancelled");
		expect(after!.fulfilledAt).toBeNull();
		expect(await countEvents(order.code)).toBe(0);
	});

	it("does not capture an order cancelled after it was committed", async () => {
		// The window after advanceToPaid returns: an admin cancels the paid
		// order, which puts the stock back, while the capture is still to come.
		const { captured, cancelled } = authorisingProvider();
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		await orderService.transitionState(order.id, "cancelled");

		const took = await ensureCaptured(order.id);

		expect(took).toEqual({ ok: false, reason: "not-fulfillable" });
		expect(captured).toHaveLength(0);
		// The hold is released rather than left hanging
		expect(cancelled).toHaveLength(1);
		expect((await orderService.getById(order.id))!.fulfilledAt).toBeNull();
	});

	it("refuses to fulfil a cancelled order and flags a captured payment", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		await db.update(payments).set({ state: "settled" }).where(eq(payments.id, payment.id));
		await orderService.transitionState(order.id, "cancelled");

		const result = await ensureFulfilled(order.id);

		expect(result.fulfilled).toBe(false);
		expect(result.errors.join(" ")).toContain("cancelled");
		expect(await countEvents(order.code)).toBe(0);

		// The money is real and the order is not — someone has to refund it
		const after = await orderService.getById(order.id);
		expect(after!.fulfillmentError).toContain("Refund required");
	});

	it("refuses to fulfil against a refunded payment", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		await db.update(payments).set({ state: "refunded" }).where(eq(payments.id, payment.id));

		const result = await ensureFulfilled(order.id);

		expect(result.fulfilled).toBe(false);
		expect(result.errors.join(" ")).toContain("refunded");
	});

	it("refunds a capture that landed just as the order was cancelled", async () => {
		// The window that cannot be checked away: the order is fine when capture
		// starts and cancelled by the time it returns. The money is real by
		// then, so it has to go back on its own rather than wait for a human.
		const refunded: number[] = [];
		let capturedOrderId: number | null = null;
		const order = await makeDraft(5000);

		paymentService.registerProvider({
			code: "auth-test",
			async createPayment() {
				return { providerTransactionId: `auth_${Math.random().toString(36).slice(2)}` };
			},
			async confirmPayment() {
				return { status: "authorized" };
			},
			async capturePayment() {
				// An admin cancels while the gateway call is in flight
				await orderService.transitionState(capturedOrderId!, "cancelled");
				return { status: "settled" };
			},
			async cancelPayment() {},
			async refundPayment(id, amount) {
				refunded.push(amount ?? 0);
				return { refundedAmount: amount ?? 0, refundId: `re_${id}` };
			}
		});

		const { payment } = await paymentService.createPayment(order, await authMethodId());
		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");
		capturedOrderId = order.id;

		const outcome = await ensureCaptured(order.id);

		expect(outcome).toEqual({ ok: false, reason: "not-fulfillable" });
		expect(refunded).toHaveLength(1);

		const after = await orderService.getById(order.id);
		expect(after!.state).toBe("cancelled");
		expect(after!.fulfilledAt).toBeNull();
		expect(after!.fulfillmentError).toContain("refunded automatically");
		expect((await paymentService.getById(payment.id))!.state).toBe("refunded");
	});

	it("reports failure through completeCheckout when the capture is refunded away", async () => {
		// Exercised end to end rather than through ensureCaptured: the outcome
		// object is always truthy, so only the real call path proves that a
		// not-fulfillable capture does not fall through to success.
		const refunded: number[] = [];
		let cancelDuringCapture: number | null = null;

		paymentService.registerProvider({
			code: "auth-test",
			async createPayment() {
				return { providerTransactionId: `auth_${Math.random().toString(36).slice(2)}` };
			},
			async confirmPayment() {
				return { status: "authorized" };
			},
			async capturePayment() {
				await orderService.transitionState(cancelDuringCapture!, "cancelled");
				return { status: "settled" };
			},
			async cancelPayment() {},
			async refundPayment(id, amount) {
				refunded.push(amount ?? 0);
				return { refundedAmount: amount ?? 0, refundId: `re_${id}` };
			}
		});

		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await authMethodId());
		cancelDuringCapture = order.id;

		const cookies = fakeCookies();
		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies
		});

		expect(result.completed).toBe(false);
		expect(result.completed === false && result.error).toContain("not been charged");
		expect(refunded).toHaveLength(1);

		// No receipt handed out, no cart cleared, nothing fulfilled
		expect(cookies.jar.get("receipts")).toBeUndefined();
		expect(cookies.deleted).toHaveLength(0);
		const after = await orderService.getById(order.id);
		expect(after!.fulfilledAt).toBeNull();
		expect(await countEvents(order.code)).toBe(0);
	});

	it("reports failure from the already-paid path when the order is no longer active", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());
		await orderService.transitionState(order.id, "payment_pending");
		await orderService.transitionState(order.id, "paid");

		// The money went back — via an admin refund, say — and the order was
		// cancelled. A browser arriving late must not be told it succeeded.
		await db.update(payments).set({ state: "refunded" }).where(eq(payments.id, payment.id));
		await orderService.transitionState(order.id, "cancelled");

		const cookies = fakeCookies();
		const result = await finishCompletedOrder((await orderService.getById(order.id))!, cookies);

		expect(result.completed).toBe(false);
		expect(cookies.jar.get("receipts")).toBeUndefined();
		expect((await orderService.getById(order.id))!.fulfilledAt).toBeNull();
	});

	it("voids the hold instead of charging when the order cannot be committed", async () => {
		const { captured, cancelled } = authorisingProvider();
		const { variant } = await makeProduct(5000, 1);
		const { order: draft } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		const method = await shippingService.getMethodByCode("flat_rate");
		const [rate] = await shippingService.getAvailableRates(
			(await orderService.getById(draft.id))!
		);
		await shippingService.setShippingMethod(draft.id, method!.id, rate.id, rate.price);
		await orderService.updateTotals(draft.id);
		const order = (await orderService.getById(draft.id))!;
		const { payment } = await paymentService.createPayment(order, await authMethodId());

		// The unit is gone by the time the shopper finishes paying
		await db
			.update(productVariants)
			.set({ stock: 0 })
			.where(eq(productVariants.id, variant.id));
		await db.delete(stockReservations).where(eq(stockReservations.orderId, order.id));

		const result = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		expect(result.completed).toBe(false);
		// Nothing taken, hold released, and the shopper is told exactly that
		expect(captured).toHaveLength(0);
		expect(cancelled).toHaveLength(1);
		expect(result.completed === false && result.error).toContain("not been charged");

		const after = await orderService.getById(order.id);
		expect(after!.state).not.toBe("paid");
		expect((await paymentService.getById(payment.id))!.state).toBe("cancelled");
	});
});

describe("advanceToPaid", () => {
	/**
	 * The step that used to throw when two completions overlapped — and a throw
	 * here reached the catch that voids the payment, so a request arriving
	 * second could cancel the authorisation the winner was about to capture.
	 */
	it("is a no-op on an order another request already advanced", async () => {
		const order = await makeDraft(5000);

		await advanceToPaid(order.id);
		expect((await orderService.getById(order.id))!.state).toBe("paid");

		// The overlapping request arrives with a stale view of the state
		await expect(advanceToPaid(order.id)).resolves.toBeUndefined();
		expect((await orderService.getById(order.id))!.state).toBe("paid");
	});

	it("picks up an order stranded halfway", async () => {
		const order = await makeDraft(5000);
		await orderService.transitionState(order.id, "payment_pending");

		await advanceToPaid(order.id);

		expect((await orderService.getById(order.id))!.state).toBe("paid");
	});
});

describe("promotion capacity", () => {
	it("refuses to let two orders consume the same last permitted use", async () => {
		const [promotion] = await db
			.insert(promotions)
			.values({
				code: `LAST-${Date.now()}`,
				title: "Last one",
				method: "code",
				discountType: "fixed_amount",
				discountValue: 500,
				usageLimit: 1,
				usageCount: 0
			})
			.returning();

		const orders_ = await Promise.all(
			[0, 1].map(async () => {
				const order = await makeDraft(5000);
				await db.insert(orderPromotions).values({
					orderId: order.id,
					promotionId: promotion.id,
					discountAmount: 500,
					type: "order"
				});
				await orderService.updateTotals(order.id);
				const fresh = (await orderService.getById(order.id))!;
				const { payment } = await paymentService.createPayment(fresh, await mockMethodId());
				return { order: fresh, payment };
			})
		);

		const results = await Promise.all(
			orders_.map(({ order, payment }) =>
				completeCheckout({
					order,
					payment,
					customerId: null,
					saveToAddressBook: false,
					cookies: fakeCookies()
				})
			)
		);

		expect(results.filter((r) => r.completed)).toHaveLength(1);

		const [after] = await db.select().from(promotions).where(eq(promotions.id, promotion.id));
		expect(after.usageCount).toBe(1);
	});

	it("drops a promotion that was disabled while the shopper was in checkout", async () => {
		const [promotion] = await db
			.insert(promotions)
			.values({
				code: `PULLED-${Date.now()}`,
				title: "Pulled offer",
				method: "code",
				discountType: "fixed_amount",
				discountValue: 500
			})
			.returning();

		const order = await makeDraft(5000);
		await db.insert(orderPromotions).values({
			orderId: order.id,
			promotionId: promotion.id,
			discountAmount: 500,
			type: "order"
		});
		await orderService.updateTotals(order.id);
		const discounted = (await orderService.getById(order.id))!;

		await db.update(promotions).set({ enabled: false }).where(eq(promotions.id, promotion.id));

		const removed = await orderService.revalidatePromotions(order.id, null);

		expect(removed).toEqual(["Pulled offer"]);
		const restored = (await orderService.getById(order.id))!;
		expect(restored.total).toBeGreaterThan(discounted.total);
	});
});

describe("competing orders for the last unit", () => {
	it("lets exactly one of two different orders take it", async () => {
		// One unit left, two shoppers who each validated it before paying —
		// which is possible whenever their reservations lapsed.
		const { variant } = await makeProduct(5000, 1);

		const drafts = await Promise.all(
			[0, 1].map(async () => {
				const { order } = await orderService.startCheckout(
					[{ variantId: variant.id, quantity: 1 }],
					{}
				);
				const method = await shippingService.getMethodByCode("flat_rate");
				const [rate] = await shippingService.getAvailableRates(
					(await orderService.getById(order.id))!
				);
				await shippingService.setShippingMethod(order.id, method!.id, rate.id, rate.price);
				await orderService.updateTotals(order.id);
				const fresh = (await orderService.getById(order.id))!;
				const { payment } = await paymentService.createPayment(fresh, await mockMethodId());
				return { order: fresh, payment };
			})
		);

		// Both reservations released, so neither is holding the unit back
		for (const { order } of drafts) {
			await db.delete(stockReservations).where(eq(stockReservations.orderId, order.id));
		}

		const results = await Promise.all(
			drafts.map(({ order, payment }) =>
				completeCheckout({
					order,
					payment,
					customerId: null,
					saveToAddressBook: false,
					cookies: fakeCookies()
				})
			)
		);

		// One sale, one refusal — never two
		expect(results.filter((r) => r.completed)).toHaveLength(1);

		const [after] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variant.id));
		expect(after.stock).toBe(0);

		const states = await Promise.all(
			drafts.map(async ({ order }) => (await orderService.getById(order.id))!.state)
		);
		expect(states.filter((state) => state === "paid")).toHaveLength(1);
	});

	it("refuses to drive stock negative even if a decrement slips through", async () => {
		const { variant } = await makeProduct(5000, 1);

		await expect(
			atomic([
				db
					.update(productVariants)
					.set({ stock: sql`${productVariants.stock} - 2` })
					.where(eq(productVariants.id, variant.id))
			])
		).rejects.toThrow(/negative/i);

		const [after] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variant.id));
		expect(after.stock).toBe(1);
	});
});

describe("when a payment webhook completes the order first", () => {
	it("still gives the browser its order code and receipt", async () => {
		const order = await makeDraft(5000);
		const { payment } = await paymentService.createPayment(order, await mockMethodId());

		// The webhook finishes the purchase — no browser, no cookies
		const webhookResult = await completeCheckout({
			order,
			payment,
			customerId: null,
			saveToAddressBook: false
		});
		expect(webhookResult.completed).toBe(true);

		// The draft the browser holds a token for is gone...
		expect(await orderService.getDraftByToken(order.checkoutToken)).toBeNull();

		// ...but the order behind that token is still reachable, which is what
		// lets the browser's own request finish instead of 404ing.
		const settled = await orderService.getByCheckoutToken(order.checkoutToken);
		expect(settled).not.toBeNull();
		expect(isSettledState(settled!.state)).toBe(true);

		const cookies = fakeCookies();
		const browserResult = await finishCompletedOrder(settled!, cookies);

		expect(browserResult).toEqual({ completed: true, orderCode: order.code });
		expect(cookies.jar.get("receipts")).toContain(order.checkoutToken!);
		expect(cookies.deleted).toContain("checkout_token");
	});
});

describe("concurrent payment creation", () => {
	it("collapses simultaneous requests onto one chargeable payment", async () => {
		const order = await makeDraft(5000);
		const methodId = await mockMethodId();

		const results = await Promise.allSettled([
			paymentService.createPayment(order, methodId),
			paymentService.createPayment(order, methodId),
			paymentService.createPayment(order, methodId)
		]);

		// Every caller gets a usable payment...
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);

		// ...but the order only ever has one chargeable row
		const chargeable = (await paymentService.getByOrderId(order.id)).filter(
			(p) => p.state === "pending" || p.state === "authorized"
		);
		expect(chargeable).toHaveLength(1);
	});

	it("bumps the payment revision only when the money actually changes", async () => {
		const order = await makeDraft(5000);
		const before = (await orderService.getById(order.id))!.paymentRevision;

		// Recalculating without a change must not invalidate an open intent
		await orderService.updateTotals(order.id);
		expect((await orderService.getById(order.id))!.paymentRevision).toBe(before);

		await db.update(orders).set({ total: 1 }).where(eq(orders.id, order.id));
		await orderService.updateTotals(order.id);
		expect((await orderService.getById(order.id))!.paymentRevision).toBeGreaterThan(before);
	});
});

describe("paymentService.isReusableFor", () => {
	it("only reuses an unsettled payment for the current total and method", async () => {
		const order = await makeDraft(5000);
		const methodId = await mockMethodId();
		const { payment } = await paymentService.createPayment(order, methodId);

		expect(paymentService.isReusableFor(payment, order, methodId)).toBe(true);
		expect(paymentService.isReusableFor(payment, order, methodId + 1)).toBe(false);
		expect(paymentService.isReusableFor(payment, { ...order, total: order.total + 1 })).toBe(
			false
		);
		expect(paymentService.isReusableFor({ ...payment, state: "declined" }, order)).toBe(false);
		expect(paymentService.isReusableFor({ ...payment, state: "settled" }, order)).toBe(false);
	});
});

describe("orderService.deleteStaleDrafts", () => {
	it("sweeps abandoned drafts but never real orders", async () => {
		const abandoned = await makeDraft(5000);
		const recent = await makeDraft(5000);
		const paid = await makeDraft(5000);

		const { payment } = await paymentService.createPayment(paid, await mockMethodId());
		await completeCheckout({
			order: paid,
			payment,
			customerId: null,
			saveToAddressBook: false,
			cookies: fakeCookies()
		});

		const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
		await db.update(orders).set({ updatedAt: longAgo }).where(eq(orders.id, abandoned.id));
		await db.update(orders).set({ updatedAt: longAgo }).where(eq(orders.id, paid.id));

		await orderService.deleteStaleDrafts();

		expect(await orderService.getById(abandoned.id)).toBeNull();
		expect(await orderService.getById(recent.id)).not.toBeNull();
		expect(await orderService.getById(paid.id)).not.toBeNull();
	});
});
