/**
 * Shared checkout completion path, used by the checkout remote commands (mock
 * payments, Stripe confirmation) and the Paytrail return route: address-book
 * save, final stock check, state transitions, shipment + digital delivery,
 * cookie cleanup. The caller navigates to the thank-you page using the
 * returned order code.
 */
import { eq } from "drizzle-orm";
import type { Cookies } from "@sveltejs/kit";
import { db } from "../db/index.js";
import { orderLines, productVariants, products } from "../db/schema.js";
import {
	orderService,
	shippingService,
	paymentService,
	isPaymentSuccessful,
	customerService
} from "./index.js";
import { digitalDeliveryService } from "./digitalDelivery.js";
import { emitEvent } from "../integrations/events.js";
import { CART_COOKIE, CHECKOUT_COOKIE } from "../cart-cookie.js";
import type { OrderWithRelations, Payment } from "$lib/types.js";

export type CompletionResult =
	| { completed: true; orderCode: string }
	| { completed: false; error: string; stockErrors?: string[] };

/**
 * Check if all items in the order are digital products
 */
export async function isOrderDigitalOnly(orderId: number): Promise<boolean> {
	const lines = await db
		.select({ productType: products.type })
		.from(orderLines)
		.innerJoin(productVariants, eq(orderLines.variantId, productVariants.id))
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(eq(orderLines.orderId, orderId));

	if (lines.length === 0) return false;
	return lines.every((line) => line.productType === "digital");
}

export async function completeCheckout(opts: {
	order: OrderWithRelations;
	payment: Payment;
	customerId: number | null;
	saveToAddressBook: boolean;
	cookies: Cookies;
}): Promise<CompletionResult> {
	const { order, payment, customerId, saveToAddressBook, cookies } = opts;
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
