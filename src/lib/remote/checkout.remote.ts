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
import { query, command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import {
	orderService,
	shippingService,
	paymentService,
	customerService
} from "$lib/server/services/index.js";
import {
	completeCheckout as completeCheckoutShared,
	isOrderDigitalOnly,
	type CompletionResult
} from "$lib/server/services/checkout-completion.js";
import { CHECKOUT_COOKIE } from "$lib/server/cart-cookie.js";
import type { OrderWithRelations, Payment, Address } from "$lib/types.js";

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
export const getCheckout = query(async () => {
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
	// and never need resuming.
	const [existingPayment] = await paymentService.getByOrderId(cart.id);
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
});

const nonEmpty = (max = 200) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const idSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const setShippingAddress = command(
	v.object({
		fullName: nonEmpty(),
		streetLine1: nonEmpty(),
		streetLine2: v.optional(nonEmpty()),
		city: nonEmpty(100),
		postalCode: nonEmpty(20),
		country: v.pipe(v.string(), v.length(2))
	}),
	async (address) => {
		const cart = await requireDraft();
		await orderService.setShippingAddress(cart.id, address);

		console.log("[checkout] shipping_address_set", {
			orderId: cart.id,
			country: address.country,
			postalCode: address.postalCode
		});

		await getCheckout().refresh();
	}
);

export const useSavedAddress = command(v.object({ addressId: idSchema }), async ({ addressId }) => {
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

	await getCheckout().refresh();
});

export const setContactInfo = command(
	v.object({
		fullName: nonEmpty(),
		email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(200))
	}),
	async ({ fullName, email }) => {
		const cart = await requireDraft();

		// Store full name in shipping field (reuse existing field)
		await orderService.setShippingAddress(cart.id, {
			fullName,
			streetLine1: "Digital Delivery",
			city: "N/A",
			postalCode: "00000",
			country: "FI"
		});

		// Store email on the order
		await orderService.setCustomerEmail(cart.id, email);

		await getCheckout().refresh();
	}
);

export const setShippingMethod = command(
	v.object({
		methodId: idSchema,
		rateId: nonEmpty(100),
		price: v.pipe(v.number(), v.integer(), v.minValue(0))
	}),
	async ({ methodId, rateId, price }) => {
		const cart = await requireDraft();
		await shippingService.setShippingMethod(cart.id, methodId, rateId, price);

		console.log("[checkout] shipping_method_set", {
			orderId: cart.id,
			methodId,
			rateId,
			price
		});

		// Recalculate totals with new shipping cost
		await orderService.updateTotals(cart.id);

		await getCheckout().refresh();
	}
);

export const applyPromotion = command(v.object({ code: nonEmpty(64) }), async ({ code }) => {
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

	await getCheckout().refresh();
	return { ok: true as const, message: result.message };
});

export const removePromotion = command(async () => {
	const cart = await requireDraft();
	await orderService.removeAllPromotions(cart.id);
	await getCheckout().refresh();
});

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
export const createPayment = command(
	v.object({
		paymentMethodId: idSchema,
		saveToAddressBook: v.optional(v.boolean(), false)
	}),
	async ({ paymentMethodId, saveToAddressBook }) => {
		const { locals } = getRequestEvent();
		const cart = await requireDraft();

		// For physical orders: need shipping address; for digital: need contact info
		const isDigitalOnly = await isOrderDigitalOnly(cart.id);
		if (isDigitalOnly) {
			if (!cart.customerEmail) {
				return { completed: false as const, error: "Contact information required" };
			}
		} else if (!cart.shippingPostalCode) {
			return { completed: false as const, error: "Shipping address required" };
		}

		try {
			// Check if payment already exists for this order
			const existingPayments = await paymentService.getByOrderId(cart.id);
			let payment: Payment;
			let paymentInfo: CheckoutPaymentInfo;

			if (existingPayments.length > 0) {
				// Payment already exists, return it
				payment = existingPayments[0];
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

			await getCheckout().refresh();
			return { completed: false as const, paymentInfo };
		} catch (err) {
			console.error("[checkout] payment_failed", {
				orderId: cart.id,
				error: (err as Error).message
			});
			return { completed: false as const, error: (err as Error).message };
		}
	}
);

/**
 * Complete the order after client-side payment confirmation (Stripe).
 */
export const completeOrder = command(
	v.object({ saveToAddressBook: v.optional(v.boolean(), false) }),
	async ({ saveToAddressBook }) => {
		const { locals } = getRequestEvent();
		const cart = await requireDraft();

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

		// Check if payment exists
		const orderPayments = await paymentService.getByOrderId(cart.id);
		if (orderPayments.length === 0) {
			return { completed: false as const, error: "Payment required" };
		}

		try {
			return await completeCheckout({
				order: cart,
				payment: orderPayments[0],
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
);
