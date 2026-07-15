/**
 * Checkout page server actions.
 *
 * The cart lives in a cookie until this page: `load` calls
 * `orderService.startCheckout`, which creates (or reconciles) a draft order
 * from the cookie lines and reserves stock for 15 minutes. All actions then
 * operate on that draft, identified by the `checkout_token` cookie.
 */
import { fail, redirect, type Cookies } from "@sveltejs/kit";
import {
	orderService,
	shippingService,
	paymentService,
	isPaymentSuccessful,
	customerService
} from "$lib/server/services/index.js";
import { digitalDeliveryService } from "$lib/server/services/digitalDelivery.js";
import { db } from "$lib/server/db/index.js";
import { orderLines, productVariants, products } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import {
	CART_COOKIE,
	CHECKOUT_COOKIE,
	CHECKOUT_COOKIE_OPTIONS,
	parseCartCookie
} from "$lib/server/cart-cookie.js";
import type { OrderWithRelations, Payment } from "$lib/types.js";
import type { PageServerLoad, Actions } from "./$types.js";

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

function getDraft(cookies: Cookies) {
	return orderService.getDraftByToken(cookies.get(CHECKOUT_COOKIE));
}

/**
 * Shared completion path for both mock payments (instant) and Stripe
 * (client-confirmed): address-book save, final stock check, state
 * transitions, shipment + digital delivery, cookie cleanup, redirect.
 */
async function completeCheckout(opts: {
	order: OrderWithRelations;
	payment: Payment;
	cookies: Cookies;
	customerId: number | null;
	saveToAddressBook: boolean;
}): Promise<never | ReturnType<typeof fail>> {
	const { order, payment, cookies, customerId, saveToAddressBook } = opts;
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
			return fail(400, {
				error: "Some items are no longer available in the requested quantity",
				stockErrors: stockCheck.errors
			});
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
		}
	}

	const finalOrder = await orderService.getById(order.id);
	if (!finalOrder) {
		return fail(500, { error: "Failed to retrieve order" });
	}

	// The cart and the draft are done — clear both cookies
	cookies.delete(CART_COOKIE, { path: "/" });
	cookies.delete(CHECKOUT_COOKIE, { path: "/" });

	throw redirect(303, `/checkout/thank-you?order=${finalOrder.code}`);
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const cartLines = parseCartCookie(cookies.get(CART_COOKIE));
	if (cartLines.length === 0) {
		return {
			cart: null,
			stockErrors: [] as string[],
			shippingRates: [],
			isDigitalOnly: false
		};
	}

	// First DB write of the shopping flow: create/reconcile the draft order
	const { order, checkoutToken, isNew, stockErrors } = await orderService.startCheckout(
		cartLines,
		{
			customerId: locals.customer?.id,
			checkoutToken: cookies.get(CHECKOUT_COOKIE)
		}
	);
	if (isNew) {
		cookies.set(CHECKOUT_COOKIE, checkoutToken, CHECKOUT_COOKIE_OPTIONS);
	}

	if (order.lines.length === 0) {
		return {
			cart: null,
			stockErrors,
			shippingRates: [],
			isDigitalOnly: false
		};
	}

	console.log("[checkout] started", {
		orderId: order.id,
		total: order.total,
		itemCount: order.lines.length,
		customerId: locals.customer?.id ?? null
	});

	const cart = order;

	// Check if cart contains only digital products
	const isDigitalOnly = await isOrderDigitalOnly(cart.id);

	// Get available shipping rates (only for physical products)
	const shippingRates = isDigitalOnly ? [] : await shippingService.getAvailableRates(cart);

	// Get available payment methods
	const paymentMethods = await paymentService.getActiveMethods();

	// Check if shipping method is already set (not needed for digital)
	const orderShipping = isDigitalOnly ? null : await shippingService.getOrderShipping(cart.id);

	// Check if a Stripe payment is already in progress (to resume card entry)
	const orderPayments = await paymentService.getByOrderId(cart.id);
	const existingPayment = orderPayments[0] || null;
	let paymentInfo = null;
	if (existingPayment && existingPayment.metadata) {
		const method = await paymentService.getMethodById(existingPayment.paymentMethodId);
		// Only set paymentInfo for Stripe (needs client-side confirmation)
		// Mock payments complete instantly and never need resuming
		if (method?.code === "stripe") {
			paymentInfo = {
				providerTransactionId: existingPayment.transactionId || "",
				clientSecret: (existingPayment.metadata as { clientSecret?: string })?.clientSecret,
				methodCode: method.code,
				metadata: existingPayment.metadata as Record<string, unknown>
			};
		}
	}

	// Get customer data for prefilling (from order or customer record)
	let customerEmail = cart.customerEmail || null;
	let customerFullName = cart.shippingFullName || null;
	let savedAddresses: NonNullable<
		Awaited<ReturnType<typeof customerService.getById>>
	>["addresses"] = [];

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

	// Load applied promotions
	const appliedPromotions = await orderService.getAppliedPromotions(cart.id);

	return {
		cart,
		stockErrors,
		shippingRates,
		paymentMethods,
		orderShipping,
		existingPayment,
		paymentInfo,
		isDigitalOnly,
		customerEmail,
		customerFullName,
		savedAddresses,
		appliedPromotions,
		isLoggedIn: !!locals.customer?.id
	};
};

export const actions: Actions = {
	applyPromotion: async ({ request, locals, cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const code = data.get("promoCode")?.toString()?.trim();

		if (!code) {
			return fail(400, { promoError: "Please enter a promotion code" });
		}

		const result = await orderService.applyPromotion(
			cart.id,
			code.toUpperCase(),
			locals.customer?.id
		);

		if (!result.success) {
			return fail(400, { promoError: result.message });
		}

		const updatedCart = await getDraft(cookies);
		const appliedPromotions = updatedCart
			? await orderService.getAppliedPromotions(updatedCart.id)
			: [];

		return {
			success: true,
			promoSuccess: result.message,
			cart: updatedCart,
			appliedPromotions
		};
	},

	removePromotion: async ({ cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		await orderService.removeAllPromotions(cart.id);

		const updatedCart = await getDraft(cookies);

		return {
			success: true,
			cart: updatedCart,
			appliedPromotions: []
		};
	},

	useSavedAddress: async ({ request, locals, cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		if (!locals.customer?.id) {
			return fail(401, { error: "Not authenticated" });
		}

		const data = await request.formData();
		const addressId = Number(data.get("addressId"));

		if (!addressId) {
			return fail(400, { error: "Address ID required" });
		}

		// Get the customer with addresses to verify ownership
		const customerWithAddresses = await customerService.getById(locals.customer.id);
		const address = customerWithAddresses?.addresses.find((a) => a.id === addressId);

		if (!address) {
			return fail(404, { error: "Address not found" });
		}

		// Set the shipping address from the saved address
		await orderService.setShippingAddress(cart.id, {
			fullName: address.fullName || "",
			streetLine1: address.streetLine1,
			streetLine2: address.streetLine2 || undefined,
			city: address.city,
			postalCode: address.postalCode,
			country: address.country
		});

		// Reload cart to get updated shipping rates
		const updatedCart = await getDraft(cookies);
		const shippingRates = updatedCart
			? await shippingService.getAvailableRates(updatedCart)
			: [];

		return {
			success: true,
			cart: updatedCart,
			shippingRates
		};
	},

	setShippingAddress: async ({ request, cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const fullName = data.get("fullName")?.toString();
		const streetLine1 = data.get("streetLine1")?.toString();
		const city = data.get("city")?.toString();
		const postalCode = data.get("postalCode")?.toString();
		const country = data.get("country")?.toString() || "FI";

		if (!fullName || !streetLine1 || !city || !postalCode) {
			return fail(400, { error: "Missing required address fields" });
		}

		await orderService.setShippingAddress(cart.id, {
			fullName,
			streetLine1,
			city,
			postalCode,
			country
		});

		console.log("[checkout] shipping_address_set", { orderId: cart.id, country, postalCode });

		// Reload cart to get updated shipping rates
		const updatedCart = await getDraft(cookies);
		const shippingRates = updatedCart
			? await shippingService.getAvailableRates(updatedCart)
			: [];

		return {
			success: true,
			cart: updatedCart,
			shippingRates
		};
	},

	setContactInfo: async ({ request, cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const fullName = data.get("fullName")?.toString();
		const email = data.get("email")?.toString();

		if (!fullName || !email) {
			return fail(400, { error: "Full name and email are required" });
		}

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

		const updatedCart = await getDraft(cookies);

		const paymentMethods = await paymentService.getActiveMethods();

		return {
			success: true,
			cart: updatedCart,
			contactInfoSet: true,
			paymentMethods
		};
	},

	setShippingMethod: async ({ request, cookies }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const methodId = data.get("methodId")?.toString();
		const rateId = data.get("rateId")?.toString();
		const price = data.get("price")?.toString();

		if (!methodId || !rateId || !price) {
			return fail(400, { error: "Missing shipping method information" });
		}

		await shippingService.setShippingMethod(
			cart.id,
			parseInt(methodId),
			rateId,
			parseInt(price)
		);

		console.log("[checkout] shipping_method_set", {
			orderId: cart.id,
			methodId,
			rateId,
			price: parseInt(price)
		});

		// Recalculate totals with new shipping cost
		await orderService.updateTotals(cart.id);

		const updatedCart = await getDraft(cookies);

		// Get the shipping method we just set
		const orderShipping = await shippingService.getOrderShipping(cart.id);

		// Get payment methods so they can be displayed
		const paymentMethods = await paymentService.getActiveMethods();

		return {
			success: true,
			cart: updatedCart,
			orderShipping,
			paymentMethods
		};
	},

	createPayment: async ({ request, cookies, locals }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		// Check if digital-only order
		const isDigitalOnly = await isOrderDigitalOnly(cart.id);

		// For physical orders: need shipping address; for digital: need contact info
		if (isDigitalOnly) {
			if (!cart.customerEmail) {
				return fail(400, { error: "Contact information required" });
			}
		} else {
			if (!cart.shippingPostalCode) {
				return fail(400, { error: "Shipping address required" });
			}
		}

		const data = await request.formData();
		const paymentMethodId = data.get("paymentMethodId")?.toString();
		const saveToAddressBook = data.get("saveToAddressBook") === "on";

		if (!paymentMethodId) {
			return fail(400, { error: "Payment method required" });
		}

		try {
			// Check if payment already exists for this order
			const existingPayments = await paymentService.getByOrderId(cart.id);
			let payment;
			let paymentInfo;

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
				const method = await paymentService.getMethodById(parseInt(paymentMethodId));
				const result = await paymentService.createPayment(cart, parseInt(paymentMethodId));
				payment = result.payment;
				paymentInfo = {
					...result.paymentInfo,
					methodCode: method?.code ?? ""
				};

				console.log("[checkout] payment_created", {
					orderId: cart.id,
					paymentId: payment.id,
					amount: payment.amount,
					method: payment.method
				});
			}

			// Mock payments complete instantly; Stripe returns a client secret
			// and finishes via the completeOrder action.
			if (paymentInfo.methodCode !== "stripe") {
				return await completeCheckout({
					order: cart,
					payment,
					cookies,
					customerId: locals.customer?.id ?? null,
					saveToAddressBook
				});
			}

			return {
				success: true,
				payment,
				paymentInfo
			};
		} catch (error) {
			if (error && typeof error === "object" && "status" in error && error.status === 303) {
				throw error; // Re-throw redirect
			}
			console.error("[checkout] payment_failed", {
				orderId: cart.id,
				error: (error as Error).message
			});
			return fail(400, { error: (error as Error).message });
		}
	},

	completeOrder: async ({ request, cookies, locals }) => {
		const cart = await getDraft(cookies);
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const saveToAddressBook = data.get("saveToAddressBook") === "on";

		// Check if digital-only order
		const isDigitalOnly = await isOrderDigitalOnly(cart.id);

		// Validate required information based on order type
		if (isDigitalOnly) {
			if (!cart.customerEmail) {
				return fail(400, { error: "Contact information required" });
			}
		} else {
			if (!cart.shippingPostalCode) {
				return fail(400, { error: "Shipping address required" });
			}

			// Check if shipping method is set (only for physical products)
			const orderShipping = await shippingService.getOrderShipping(cart.id);
			if (!orderShipping) {
				return fail(400, { error: "Shipping method required" });
			}
		}

		// Check if payment exists
		const orderPayments = await paymentService.getByOrderId(cart.id);
		if (orderPayments.length === 0) {
			return fail(400, { error: "Payment required" });
		}

		try {
			return await completeCheckout({
				order: cart,
				payment: orderPayments[0],
				cookies,
				customerId: locals.customer?.id ?? null,
				saveToAddressBook
			});
		} catch (error) {
			if (error && typeof error === "object" && "status" in error && error.status === 303) {
				throw error; // Re-throw redirect
			}
			console.error("[order] completion_failed", {
				orderId: cart.id,
				error: (error as Error).message
			});
			return fail(400, { error: (error as Error).message });
		}
	}
};
