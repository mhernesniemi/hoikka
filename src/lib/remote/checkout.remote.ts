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
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/index.js";
import { orderLines, productVariants, products } from "$lib/server/db/schema.js";
import {
	orderService,
	shippingService,
	paymentService,
	isPaymentSuccessful,
	customerService
} from "$lib/server/services/index.js";
import { digitalDeliveryService } from "$lib/server/services/digitalDelivery.js";
import { emitEvent } from "$lib/server/integrations/events.js";
import { CART_COOKIE, CHECKOUT_COOKIE } from "$lib/server/cart-cookie.js";
import type { OrderWithRelations, Payment, Address } from "$lib/types.js";

export type CheckoutPaymentInfo = {
	providerTransactionId: string;
	clientSecret?: string;
	methodCode: string;
	metadata: Record<string, unknown>;
};

type CompletionResult =
	| { completed: true; orderCode: string }
	| { completed: false; error: string; stockErrors?: string[] };

/**
 * Check if all items in the order are digital products
 */
async function isOrderDigitalOnly(orderId: number): Promise<boolean> {
	const lines = await db
		.select({ productType: products.type })
		.from(orderLines)
		.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(eq(orderLines.orderId, orderId));

	if (lines.length === 0) return false;
	return lines.every((line) => line.productType === "digital");
}

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

	// Check if a Stripe payment is already in progress (to resume card entry).
	// Mock payments complete instantly and never need resuming.
	const [existingPayment] = await paymentService.getByOrderId(cart.id);
	let paymentInfo: CheckoutPaymentInfo | null = null;
	if (existingPayment && existingPayment.metadata) {
		const method = await paymentService.getMethodById(existingPayment.paymentMethodId);
		if (method?.code === "stripe") {
			paymentInfo = {
				providerTransactionId: existingPayment.transactionId || "",
				clientSecret: (existingPayment.metadata as { clientSecret?: string })?.clientSecret,
				methodCode: method.code,
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
 * Shared completion path for both mock payments (instant) and Stripe
 * (client-confirmed): address-book save, final stock check, state
 * transitions, shipment + digital delivery, cookie cleanup. The client
 * navigates to the thank-you page using the returned order code.
 */
async function completeCheckout(opts: {
	order: OrderWithRelations;
	payment: Payment;
	customerId: number | null;
	saveToAddressBook: boolean;
}): Promise<CompletionResult> {
	const { cookies } = getRequestEvent();
	const { order, payment, customerId, saveToAddressBook } = opts;
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

	// Final stock validation (skip for digital products)
	if (!isDigitalOnly) {
		const stockCheck = await orderService.validateStock(order.id);
		if (!stockCheck.valid) {
			return {
				completed: false,
				error: "Some items are no longer available in the requested quantity",
				stockErrors: stockCheck.errors
			};
		}
	}

	// The draft becomes a real order
	await orderService.transitionState(order.id, "payment_pending");

	const paymentStatus = await paymentService.confirmPayment(payment.id);

	if (isPaymentSuccessful(paymentStatus)) {
		await orderService.transitionState(order.id, "paid");

		console.log("[order] completed", {
			orderId: order.id,
			total: order.total,
			customerId,
			isDigitalOnly
		});

		const paidOrder = await orderService.getById(order.id);
		if (paidOrder) {
			if (!isDigitalOnly) {
				try {
					await shippingService.createShipment(paidOrder);
				} catch (e) {
					console.error("Error creating shipment:", e);
					// Don't fail the order if shipment creation fails
				}
			}

			try {
				const deliveryResult = await digitalDeliveryService.deliverOrder(order.id);
				if (deliveryResult.errors.length > 0) {
					console.error("Digital delivery errors:", deliveryResult.errors);
				}
			} catch (e) {
				console.error("Error delivering digital products:", e);
				// Don't fail the order if digital delivery fails
			}

			// Record an out-of-band event (webhook / ERP sync / etc.) for the
			// outbox to process. Durable and non-blocking — see integrations/.
			await emitEvent("order.paid", {
				code: paidOrder?.code,
				total: order.total,
				customerEmail: order.customerEmail,
				isDigitalOnly
			});
		}
	}

	const finalOrder = await orderService.getById(order.id);
	if (!finalOrder) {
		return { completed: false, error: "Failed to retrieve order" };
	}

	// The cart and the draft are done — clear both cookies
	cookies.delete(CART_COOKIE, { path: "/" });
	cookies.delete(CHECKOUT_COOKIE, { path: "/" });

	return { completed: true, orderCode: finalOrder.code };
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
				paymentInfo = {
					providerTransactionId: payment.transactionId || "",
					clientSecret: (payment.metadata as { clientSecret?: string })?.clientSecret,
					methodCode: method?.code ?? "",
					metadata: payment.metadata as Record<string, unknown>
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

			// Mock payments complete instantly; Stripe returns a client secret
			// and finishes via the completeOrder command.
			if (paymentInfo.methodCode !== "stripe") {
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
