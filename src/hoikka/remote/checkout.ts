/**
 * Checkout remote functions.
 *
 * The checkout page load (`+page.server.ts`) reconciles the cart cookie into
 * a draft order (`orderService.startCheckout`) and sets the `checkout_token`
 * cookie. Everything after that lives here: `getCheckout` is the single
 * source of truth the page renders from, and each mutating `command()`
 * updates the draft and refreshes the query in the same roundtrip
 * (single-flight mutation).
 *
 * Completion (`createPayment` for mock, `completeOrder` after Stripe
 * confirmation) cannot redirect from a command — it clears both cart cookies
 * and returns `{ completed: true, orderCode }` so the client can navigate to
 * the thank-you page.
 */
import { getRequestEvent } from "$app/server";
import config from "$hoikka/config";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import {
	orderService,
	shippingService,
	paymentService,
	customerService
} from "@hoikka/core/server/services/index";
import {
	completeCheckout as completeCheckoutShared,
	finishCompletedOrder,
	type CompletionResult
} from "@hoikka/core/server/services/checkout-completion";
import { isOrderDigitalOnly } from "@hoikka/core/server/services/fulfillment";
import { isSettledState } from "@hoikka/core/server/services/order-utils";
import { digitalDeliveryService } from "@hoikka/core/server/services/digitalDelivery";
import { CHECKOUT_COOKIE } from "@hoikka/core/server/cart-cookie";
import type { RequestEvent } from "@sveltejs/kit";
import type { OrderWithRelations, Payment, Address } from "@hoikka/core/shared/types";

export type CheckoutPaymentInfo = {
	providerTransactionId: string;
	clientSecret?: string;
	redirectUrl?: string;
	methodCode: string;
	metadata: Record<string, unknown>;
};

async function requireDraft(): Promise<OrderWithRelations> {
	const { cookies } = getRequestEvent();
	const cart = await orderService.getDraftByToken(cookies.get(CHECKOUT_COOKIE));
	if (!cart) error(404, "Cart not found");
	return cart;
}

/**
 * Everything the checkout page needs to render, derived from the draft order
 * identified by the `checkout_token` cookie. Returns null when there is no
 * draft (empty cart, expired token, or completed order).
 */

const nonEmpty = (max = 200) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const idSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const schemas = {
	setShippingAddress: v.object({
		fullName: nonEmpty(),
		streetLine1: nonEmpty(),
		streetLine2: v.optional(nonEmpty()),
		city: nonEmpty(100),
		postalCode: nonEmpty(20),
		country: v.pipe(v.string(), v.length(2))
	}),
	useSavedAddress: v.object({ addressId: idSchema }),
	setContactInfo: v.object({
		fullName: nonEmpty(),
		email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(200))
	}),
	setShippingMethod: v.object({ methodId: idSchema, rateId: nonEmpty(100) }),
	applyPromotion: v.object({ code: nonEmpty(64) }),
	createPayment: v.object({
		paymentMethodId: idSchema,
		saveToAddressBook: v.optional(v.boolean(), false)
	}),
	completeOrder: v.object({ saveToAddressBook: v.optional(v.boolean(), false) })
};

export const getCheckout = async () => {
	const { cookies, locals } = getRequestEvent();
	const cart = await orderService.getDraftByToken(cookies.get(CHECKOUT_COOKIE));
	if (!cart || cart.lines.length === 0) return null;

	// Check if cart contains only digital products
	const isDigitalOnly = await isOrderDigitalOnly(cart.id);

	// Shipping rates and selected method only matter for physical products
	const shippingRates = isDigitalOnly ? [] : await shippingService.getAvailableRates(cart);
	const orderShipping = isDigitalOnly ? null : await shippingService.getOrderShipping(cart.id);

	const paymentMethods = await paymentService.getActiveMethods();

	// Check if a Stripe or redirect-provider payment is already in progress
	// (to resume card entry / the redirect). Mock payments complete instantly
	// and never need resuming. Only a payment that still matches the order is
	// offered for resuming — a superseded one would charge the old total.
	const existingPayment = (await paymentService.getByOrderId(cart.id)).find((p) =>
		paymentService.isReusableFor(p, cart)
	);
	let paymentInfo: CheckoutPaymentInfo | null = null;
	if (existingPayment && existingPayment.metadata) {
		const method = await paymentService.getMethodById(existingPayment.paymentMethodId);
		const existingMetadata = existingPayment.metadata as { redirectUrl?: string };
		if (method?.code === "stripe" || existingMetadata.redirectUrl) {
			const metadata = existingPayment.metadata as {
				clientSecret?: string;
				redirectUrl?: string;
			};
			paymentInfo = {
				providerTransactionId: existingPayment.transactionId || "",
				clientSecret: metadata.clientSecret,
				redirectUrl: metadata.redirectUrl,
				methodCode: method?.code ?? "",
				metadata: existingPayment.metadata as Record<string, unknown>
			};
		}
	}

	// Customer data for prefilling (from order or customer record)
	let customerEmail = cart.customerEmail || null;
	let customerFullName = cart.shippingFullName || null;
	let savedAddresses: Address[] = [];

	if (locals.customer?.id) {
		const customerWithAddresses = await customerService.getById(locals.customer.id);
		if (customerWithAddresses) {
			if (!customerEmail) customerEmail = customerWithAddresses.email || null;
			if (
				!customerFullName &&
				(customerWithAddresses.firstName || customerWithAddresses.lastName)
			) {
				customerFullName = [customerWithAddresses.firstName, customerWithAddresses.lastName]
					.filter(Boolean)
					.join(" ");
			}
			savedAddresses = customerWithAddresses.addresses || [];
		}
	}

	const appliedPromotions = await orderService.getAppliedPromotions(cart.id);

	return {
		cart,
		isDigitalOnly,
		shippingRates,
		orderShipping,
		paymentMethods,
		paymentInfo,
		customerEmail,
		customerFullName,
		savedAddresses,
		appliedPromotions,
		isLoggedIn: !!locals.customer?.id
	};
};

/**
 * Command handlers. `refresh` re-runs the checkout query after a mutation
 * (single-flight refresh) — the app wrapper passes `() => query().refresh()`.
 */
export function commands(refresh: () => Promise<void>) {
	return {
		setShippingAddress: async (
			address: v.InferOutput<(typeof schemas)["setShippingAddress"]>
		) => {
			const cart = await requireDraft();
			await orderService.setShippingAddress(cart.id, address);

			console.log("[checkout] shipping_address_set", {
				orderId: cart.id,
				country: address.country,
				postalCode: address.postalCode
			});

			await refresh();
		},
		useSavedAddress: async ({
			addressId
		}: v.InferOutput<(typeof schemas)["useSavedAddress"]>) => {
			const { locals } = getRequestEvent();
			if (!locals.customer?.id) error(401, "Not authenticated");

			const cart = await requireDraft();

			// Get the customer with addresses to verify ownership
			const customerWithAddresses = await customerService.getById(locals.customer.id);
			const address = customerWithAddresses?.addresses.find((a) => a.id === addressId);
			if (!address) error(404, "Address not found");

			await orderService.setShippingAddress(cart.id, {
				fullName: address.fullName || "",
				streetLine1: address.streetLine1,
				streetLine2: address.streetLine2 || undefined,
				city: address.city,
				postalCode: address.postalCode,
				country: address.country
			});

			await refresh();
		},
		setContactInfo: async ({
			fullName,
			email
		}: v.InferOutput<(typeof schemas)["setContactInfo"]>) => {
			const cart = await requireDraft();

			// Store full name in shipping field (reuse existing field)
			await orderService.setShippingAddress(cart.id, {
				fullName,
				streetLine1: "Digital Delivery",
				city: "N/A",
				postalCode: "00000",
				country: config.countries.default
			});

			// Store email on the order
			await orderService.setCustomerEmail(cart.id, email);

			await refresh();
		},
		setShippingMethod: async ({
			methodId,
			rateId
		}: v.InferOutput<(typeof schemas)["setShippingMethod"]>) => {
			const cart = await requireDraft();

			const rates = await shippingService.getAvailableRates(cart);
			const rate = rates.find((r) => r.id === rateId && r.methodId === methodId);
			if (!rate?.methodId) error(400, "Shipping rate is no longer available");

			await shippingService.setShippingMethod(cart.id, rate.methodId, rate.id, rate.price);

			console.log("[checkout] shipping_method_set", {
				orderId: cart.id,
				methodId: rate.methodId,
				rateId: rate.id,
				price: rate.price
			});

			// Recalculate totals with new shipping cost
			await orderService.updateTotals(cart.id);

			await refresh();
		},
		applyPromotion: async ({ code }: v.InferOutput<(typeof schemas)["applyPromotion"]>) => {
			const { locals } = getRequestEvent();
			const cart = await requireDraft();

			const result = await orderService.applyPromotion(
				cart.id,
				code.toUpperCase(),
				locals.customer?.id
			);
			if (!result.success) {
				return { ok: false as const, message: result.message };
			}

			await refresh();
			return { ok: true as const, message: result.message };
		},
		removePromotion: async () => {
			const cart = await requireDraft();
			await orderService.removeAllPromotions(cart.id);
			await refresh();
		},
		createPayment: async ({
			paymentMethodId,
			saveToAddressBook
		}: v.InferOutput<(typeof schemas)["createPayment"]>) => {
			const { locals } = getRequestEvent();
			const cart = await requireDraft();

			// For physical orders: need shipping address and a chosen rate; for
			// digital: contact info. Shipping is checked here too, not only at
			// completion, so no payment is ever created for an order whose shipping
			// cost is still missing from the total.
			const isDigitalOnly = await isOrderDigitalOnly(cart.id);
			if (isDigitalOnly) {
				if (!cart.customerEmail) {
					return { completed: false as const, error: "Contact information required" };
				}
			} else {
				if (!cart.shippingPostalCode) {
					return { completed: false as const, error: "Shipping address required" };
				}
				if (!(await shippingService.getOrderShipping(cart.id))) {
					return { completed: false as const, error: "Shipping method required" };
				}
			}

			// A promotion applied earlier in the session may have been disabled,
			// expired, or used up since. Re-check before a payment is created for a
			// total that includes it.
			const droppedPromotions = await orderService.revalidatePromotions(
				cart.id,
				locals.customer?.id
			);
			if (droppedPromotions.length > 0) {
				return {
					completed: false as const,
					error: `${droppedPromotions.join(", ")} is no longer available. Your total has been updated — please review it and try again.`
				};
			}

			// Never take money for a digital item that has nothing to hand over — and
			// pin the file to the order line while checking, so a later edit to the
			// product cannot leave this order undeliverable.
			const { undeliverable } = await digitalDeliveryService.snapshotDeliverables(cart.id);
			if (undeliverable.length > 0) {
				console.error("[checkout] undeliverable_digital_lines", {
					orderId: cart.id,
					products: undeliverable
				});
				return {
					completed: false as const,
					error: `${undeliverable.join(", ")} is not available for download right now. Please remove it from your order or try again later.`
				};
			}

			try {
				// Reuse an in-flight payment only while it still matches the order:
				// same method, still unsettled, still for exactly the current total.
				// Anything else is voided so the shopper can't settle a grown order
				// with an intent created for a smaller one.
				const existingPayments = await paymentService.getByOrderId(cart.id);
				const reusable = existingPayments.find((p) =>
					paymentService.isReusableFor(p, cart, paymentMethodId)
				);

				for (const stale of existingPayments) {
					if (
						stale.id !== reusable?.id &&
						(stale.state === "pending" || stale.state === "authorized")
					) {
						console.log("[checkout] payment_superseded", {
							orderId: cart.id,
							paymentId: stale.id,
							paymentAmount: stale.amount,
							orderTotal: cart.total
						});
						await paymentService.cancelPayment(stale.id);
					}
				}

				let payment: Payment;
				let paymentInfo: CheckoutPaymentInfo;

				if (reusable) {
					payment = reusable;
					const method = await paymentService.getMethodById(payment.paymentMethodId);
					const metadata = payment.metadata as {
						clientSecret?: string;
						redirectUrl?: string;
					} | null;
					paymentInfo = {
						providerTransactionId: payment.transactionId || "",
						clientSecret: metadata?.clientSecret,
						redirectUrl: metadata?.redirectUrl,
						methodCode: method?.code ?? "",
						metadata: (payment.metadata ?? {}) as Record<string, unknown>
					};
				} else {
					// Create payment via provider
					const method = await paymentService.getMethodById(paymentMethodId);
					const result = await paymentService.createPayment(cart, paymentMethodId);
					payment = result.payment;
					paymentInfo = {
						...result.paymentInfo,
						methodCode: method?.code ?? "",
						metadata: result.paymentInfo.metadata ?? {}
					};

					console.log("[checkout] payment_created", {
						orderId: cart.id,
						paymentId: payment.id,
						amount: payment.amount,
						method: payment.method
					});
				}

				// Mock payments complete instantly. Stripe returns a client secret
				// (finishes via completeOrder); redirect providers (PayPal, Klarna,
				// Paytrail, ...) return a redirectUrl the client navigates to, and
				// the provider's return route completes the order.
				if (paymentInfo.methodCode !== "stripe" && !paymentInfo.redirectUrl) {
					return await completeCheckout({
						order: cart,
						payment,
						customerId: locals.customer?.id ?? null,
						saveToAddressBook
					});
				}

				await refresh();
				return { completed: false as const, paymentInfo };
			} catch (err) {
				console.error("[checkout] payment_failed", {
					orderId: cart.id,
					error: (err as Error).message
				});
				return { completed: false as const, error: (err as Error).message };
			}
		},
		completeOrder: async ({
			saveToAddressBook
		}: v.InferOutput<(typeof schemas)["completeOrder"]>) => {
			const { locals, cookies } = getRequestEvent();

			// The draft may already be gone — either a payment webhook completed the
			// purchase while the browser was still confirming, or a crash left the
			// order mid-settlement. In both cases the shopper's money may already be
			// captured, so look past the draft rather than 404ing them into a fresh
			// cart they could pay for a second time.
			const token = cookies.get(CHECKOUT_COOKIE);
			const draft = await orderService.getDraftByToken(token);
			if (!draft) {
				const resumed = await resumeOrderForToken(token, cookies);
				if (resumed) return resumed;
				error(404, "Cart not found");
			}
			const cart = draft;

			// Validate required information based on order type
			const isDigitalOnly = await isOrderDigitalOnly(cart.id);
			if (isDigitalOnly) {
				if (!cart.customerEmail) {
					return { completed: false as const, error: "Contact information required" };
				}
			} else {
				if (!cart.shippingPostalCode) {
					return { completed: false as const, error: "Shipping address required" };
				}

				// Check if shipping method is set (only for physical products)
				const orderShipping = await shippingService.getOrderShipping(cart.id);
				if (!orderShipping) {
					return { completed: false as const, error: "Shipping method required" };
				}
			}

			const droppedPromotions = await orderService.revalidatePromotions(
				cart.id,
				locals.customer?.id
			);
			if (droppedPromotions.length > 0) {
				return {
					completed: false as const,
					error: `${droppedPromotions.join(", ")} is no longer available. Your total has been updated — please review it and try again.`
				};
			}

			// The payment must still match the order — completeCheckout re-checks
			// this, but picking the right row here keeps the error message useful.
			const orderPayments = await paymentService.getByOrderId(cart.id);
			const payment = orderPayments.find((p) => paymentService.isReusableFor(p, cart));
			if (!payment) {
				return {
					completed: false as const,
					error:
						orderPayments.length === 0
							? "Payment required"
							: "The order total changed — please start the payment again"
				};
			}

			try {
				return await completeCheckout({
					order: cart,
					payment,
					customerId: locals.customer?.id ?? null,
					saveToAddressBook
				});
			} catch (err) {
				console.error("[order] completion_failed", {
					orderId: cart.id,
					error: (err as Error).message
				});
				return { completed: false as const, error: (err as Error).message };
			}
		}
	};
}

/**
 * Select a shipping rate. The client only names the rate; the price comes from
 * re-quoting the order server-side, so a tampered request can't buy cheaper
 * (or free) shipping.
 */

/**
 * Shared completion path for mock payments (instant), Stripe
 * (client-confirmed) and redirect providers (return/callback routes) — the
 * logic lives in services/checkout-completion.ts; this wrapper binds the
 * current request's cookies.
 */
async function completeCheckout(opts: {
	order: OrderWithRelations;
	payment: Payment;
	customerId: number | null;
	saveToAddressBook: boolean;
}): Promise<CompletionResult> {
	const { cookies } = getRequestEvent();
	return completeCheckoutShared({ ...opts, cookies });
}

/**
 * Create a payment for the draft. Mock payments complete the order inline;
 * Stripe returns a client secret for client-side confirmation, after which
 * the client calls `completeOrder`.
 */

/**
 * Pick up an order whose draft is no longer active: already settled (hand back
 * the code and the receipt) or stranded in payment_pending by a crash (verify
 * the payment with the gateway and carry it through). Returns null when the
 * token points at nothing recoverable.
 */
async function resumeOrderForToken(
	token: string | undefined,
	cookies: RequestEvent["cookies"]
): Promise<CompletionResult | null> {
	const order = await orderService.getByCheckoutToken(token);
	if (!order) return null;

	if (isSettledState(order.state)) {
		console.log("[checkout] completed_elsewhere", { orderId: order.id });
		return await finishCompletedOrder(order, cookies);
	}

	if (order.state === "payment_pending") {
		// Money was taken but the order never reached "paid". completeCheckout
		// re-verifies with the gateway before committing anything.
		const payment = await paymentService.getPrimaryForOrder(order.id);
		if (!payment) return null;

		console.log("[checkout] resuming_payment_pending", { orderId: order.id });
		return await completeCheckoutShared({
			order,
			payment,
			customerId: order.customerId ?? null,
			saveToAddressBook: false,
			cookies
		});
	}

	return null;
}

/**
 * Complete the order after client-side payment confirmation (Stripe).
 */
