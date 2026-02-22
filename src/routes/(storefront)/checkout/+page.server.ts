/**
 * Checkout page server actions
 */
import { fail, redirect } from "@sveltejs/kit";
import {
	orderService,
	shippingService,
	paymentService,
	isPaymentSuccessful,
	customerService
} from "$lib/server/services/index.js";
import { digitalDeliveryService } from "$lib/server/services/digitalDelivery.js";
import { db } from "$lib/server/db/index.js";
import { orderLines, productVariants, products, customers } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import type { PageServerLoad, Actions } from "./$types.js";

/**
 * Check if all items in the cart are digital products
 */
async function isCartDigitalOnly(cartId: number): Promise<boolean> {
	const lines = await db
		.select({ productType: products.type })
		.from(orderLines)
		.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(eq(orderLines.orderId, cartId));

	if (lines.length === 0) return false;
	return lines.every((line) => line.productType === "digital");
}

export const load: PageServerLoad = async ({ locals }) => {
	// Use locals.cartToken and locals.customer?.id (set by hooks.server.ts)
	const cart = await orderService.getActiveCart({
		customerId: locals.customer?.id,
		cartToken: locals.cartToken
	});
	if (!cart) {
		return {
			cart: null,
			shippingRates: [],
			isDigitalOnly: false
		};
	}

	console.log("[checkout] started", {
		orderId: cart.id,
		total: cart.total,
		itemCount: cart.lines?.length ?? 0,
		customerId: locals.customer?.id ?? null
	});

	// Check if cart contains only digital products
	const isDigitalOnly = await isCartDigitalOnly(cart.id);

	// Get available shipping rates (only for physical products)
	const shippingRates = isDigitalOnly ? [] : await shippingService.getAvailableRates(cart);

	// Get available payment methods
	const paymentMethods = await paymentService.getActiveMethods();

	// Check if shipping method is already set (not needed for digital)
	const orderShipping = isDigitalOnly ? null : await shippingService.getOrderShipping(cart.id);

	// Check if payment is already created
	const orderPayments = await paymentService.getByOrderId(cart.id);
	const existingPayment = orderPayments[0] || null;
	let paymentInfo = null;
	if (existingPayment && existingPayment.metadata) {
		const method = await paymentService.getMethodById(existingPayment.paymentMethodId);
		paymentInfo = {
			providerTransactionId: existingPayment.transactionId || "",
			clientSecret: (existingPayment.metadata as any)?.clientSecret,
			methodCode: method?.code ?? "",
			metadata: existingPayment.metadata as Record<string, unknown>
		};
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
	applyPromotion: async ({ request, locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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

		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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

	removePromotion: async ({ locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		await orderService.removeAllPromotions(cart.id);

		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});

		return {
			success: true,
			cart: updatedCart,
			appliedPromotions: []
		};
	},

	useSavedAddress: async ({ request, locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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
		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
		const shippingRates = updatedCart
			? await shippingService.getAvailableRates(updatedCart)
			: [];

		return {
			success: true,
			cart: updatedCart,
			shippingRates
		};
	},

	setShippingAddress: async ({ request, locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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
		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
		const shippingRates = updatedCart
			? await shippingService.getAvailableRates(updatedCart)
			: [];

		return {
			success: true,
			cart: updatedCart,
			shippingRates
		};
	},

	setContactInfo: async ({ request, locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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

		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});

		const paymentMethods = await paymentService.getActiveMethods();

		return {
			success: true,
			cart: updatedCart,
			contactInfoSet: true,
			paymentMethods
		};
	},

	setShippingMethod: async ({ request, locals }) => {
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
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

		const updatedCart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});

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
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		// Check if digital-only order
		const isDigitalOnly = await isCartDigitalOnly(cart.id);

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
					clientSecret: (payment.metadata as any)?.clientSecret,
					methodCode: method?.code ?? "",
					metadata: payment.metadata as Record<string, unknown>
				};
			} else {
				// Load full order relations for payment
				const order = await orderService.getById(cart.id);
				if (!order) {
					return fail(404, { error: "Order not found" });
				}

				// Create payment via provider
				const method = await paymentService.getMethodById(parseInt(paymentMethodId));
				const result = await paymentService.createPayment(order, parseInt(paymentMethodId));
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

			// For mock payments, complete the order immediately
			if (paymentInfo.methodCode !== "stripe") {
				// Save address to customer's address book if requested
				if (
					saveToAddressBook &&
					locals.customer?.id &&
					!isDigitalOnly &&
					cart.shippingStreetLine1
				) {
					try {
						await customerService.addAddress(locals.customer.id, {
							fullName: cart.shippingFullName || undefined,
							streetLine1: cart.shippingStreetLine1,
							city: cart.shippingCity || "",
							postalCode: cart.shippingPostalCode || "",
							country: cart.shippingCountry || "FI",
							isDefault: false
						});
					} catch (e) {
						console.error("Error saving address to address book:", e);
					}
				}

				// Validate stock availability (skip for digital products)
				if (!isDigitalOnly) {
					const stockCheck = await orderService.validateStock(cart.id);
					if (!stockCheck.valid) {
						return fail(400, {
							error: "Some items are no longer available in the requested quantity",
							stockErrors: stockCheck.errors
						});
					}
				}

				// Transition order to payment_pending
				await orderService.transitionState(cart.id, "payment_pending");

				// Confirm payment
				const paymentStatus = await paymentService.confirmPayment(payment.id);

				if (isPaymentSuccessful(paymentStatus)) {
					await orderService.transitionState(cart.id, "paid");

					console.log("[order] completed", {
						orderId: cart.id,
						total: cart.total,
						customerId: locals.customer?.id ?? null,
						isDigitalOnly
					});

					const order = await orderService.getById(cart.id);
					if (order) {
						if (!isDigitalOnly) {
							try {
								await shippingService.createShipment(order);
							} catch (e) {
								console.error("Error creating shipment:", e);
							}
						}

						try {
							const deliveryResult = await digitalDeliveryService.deliverOrder(
								cart.id
							);
							if (deliveryResult.errors.length > 0) {
								console.error("Digital delivery errors:", deliveryResult.errors);
							}
						} catch (e) {
							console.error("Error delivering digital products:", e);
						}
					}
				}

				const finalOrder = await orderService.getById(cart.id);
				if (!finalOrder) {
					return fail(500, { error: "Failed to retrieve order" });
				}

				cookies.delete("cart_token", { path: "/" });

				throw redirect(303, `/checkout/thank-you?order=${finalOrder.code}`);
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
		const cart = await orderService.getActiveCart({
			customerId: locals.customer?.id,
			cartToken: locals.cartToken
		});
		if (!cart) {
			return fail(404, { error: "Cart not found" });
		}

		const data = await request.formData();
		const saveToAddressBook = data.get("saveToAddressBook") === "on";

		// Check if digital-only order
		const isDigitalOnly = await isCartDigitalOnly(cart.id);

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

		// Validate stock availability (skip for digital products)
		if (!isDigitalOnly) {
			const stockCheck = await orderService.validateStock(cart.id);
			if (!stockCheck.valid) {
				return fail(400, {
					error: "Some items are no longer available in the requested quantity",
					stockErrors: stockCheck.errors
				});
			}
		}

		try {
			// Save address to customer's address book if requested
			if (
				saveToAddressBook &&
				locals.customer?.id &&
				!isDigitalOnly &&
				cart.shippingStreetLine1
			) {
				try {
					await customerService.addAddress(locals.customer.id, {
						fullName: cart.shippingFullName || undefined,
						streetLine1: cart.shippingStreetLine1,
						city: cart.shippingCity || "",
						postalCode: cart.shippingPostalCode || "",
						country: cart.shippingCountry || "FI",
						isDefault: false
					});
				} catch (e) {
					console.error("Error saving address to address book:", e);
					// Don't fail the order if address book save fails
				}
			}

			// Transition order to payment_pending (marks cart as inactive)
			await orderService.transitionState(cart.id, "payment_pending");

			// Confirm payment (for mock provider, this will mark it as completed)
			const payment = orderPayments[0];
			const paymentStatus = await paymentService.confirmPayment(payment.id);

			// If payment is successful, transition order to paid
			if (isPaymentSuccessful(paymentStatus)) {
				await orderService.transitionState(cart.id, "paid");

				console.log("[order] completed", {
					orderId: cart.id,
					total: cart.total,
					customerId: locals.customer?.id ?? null,
					isDigitalOnly
				});

				const order = await orderService.getById(cart.id);
				if (order) {
					// Create shipment only for physical products
					if (!isDigitalOnly) {
						try {
							await shippingService.createShipment(order);
						} catch (e) {
							console.error("Error creating shipment:", e);
							// Don't fail the order if shipment creation fails
						}
					}

					// Deliver digital products via email
					try {
						const deliveryResult = await digitalDeliveryService.deliverOrder(cart.id);
						if (deliveryResult.errors.length > 0) {
							console.error("Digital delivery errors:", deliveryResult.errors);
						}
					} catch (e) {
						console.error("Error delivering digital products:", e);
						// Don't fail the order if digital delivery fails
					}
				}
			}

			// Get final order with code for redirect
			const finalOrder = await orderService.getById(cart.id);
			if (!finalOrder) {
				return fail(500, { error: "Failed to retrieve order" });
			}

			// Clear cart token cookie
			cookies.delete("cart_token", { path: "/" });

			// Redirect to thank you page
			throw redirect(303, `/checkout/thank-you?order=${finalOrder.code}`);
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
