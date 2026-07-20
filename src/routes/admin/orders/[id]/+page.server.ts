import { orderService } from "$lib/server/services/orders.js";
import { shippingService, paymentService } from "$lib/server/services/index.js";
import { emitEvent } from "$lib/server/integrations/events.js";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);

	if (isNaN(id)) {
		throw error(404, "Invalid order ID");
	}

	const order = await orderService.getById(id);

	if (!order) {
		throw error(404, "Order not found");
	}

	// Load shipping info
	const orderShipping = await shippingService.getOrderShipping(id);
	let shippingMethod = null;
	if (orderShipping) {
		shippingMethod = await shippingService.getMethodById(orderShipping.shippingMethodId);
	}

	// Load payment info
	const orderPayments = await paymentService.getByOrderId(id);
	const payment = orderPayments[0] || null;
	let paymentMethod = null;
	if (payment) {
		paymentMethod = await paymentService.getMethodById(payment.paymentMethodId);
	}

	return { order, orderShipping, shippingMethod, payment, paymentMethod };
};

export const actions: Actions = {
	transition: async ({ params, request }) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const newState = formData.get("state") as string;

		try {
			await orderService.transitionState(id, newState as any);

			// If transitioning to 'paid', create shipment
			if (newState === "paid") {
				const order = await orderService.getById(id);
				if (order) {
					try {
						await shippingService.createShipment(order);
					} catch (e) {
						console.error("Error creating shipment:", e);
						// Don't fail the transition if shipment creation fails
					}
				}
			}

			// Shipment-confirmation email goes out via the outbox
			if (newState === "shipped") {
				const order = await orderService.getById(id);
				if (order) {
					const shipping = await shippingService.getOrderShipping(id);
					await emitEvent("order.shipped", {
						code: order.code,
						trackingNumber: shipping?.trackingNumber ?? null
					});
				}
			}

			return { success: true };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	updateShippingStatus: async ({ params, request }) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const status = formData.get("status") as string;

		try {
			await shippingService.updateShippingStatus(id, status as any);
			return { success: true };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	trackShipment: async ({ params }) => {
		const id = Number(params.id);

		try {
			const status = await shippingService.trackShipment(id);
			return { success: true, trackingStatus: status };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	confirmPayment: async ({ params }) => {
		const id = Number(params.id);

		try {
			const orderPayments = await paymentService.getByOrderId(id);
			if (orderPayments.length === 0) {
				return fail(404, { error: "No payment found for this order" });
			}

			const status = await paymentService.confirmPayment(orderPayments[0].id);
			return { success: true, paymentStatus: status };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	refundPayment: async ({ params, request }) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const amount = formData.get("amount")?.toString();

		try {
			const orderPayments = await paymentService.getByOrderId(id);
			if (orderPayments.length === 0) {
				return fail(404, { error: "No payment found for this order" });
			}

			const refundAmount = amount ? parseInt(amount) : undefined;
			const refundInfo = await paymentService.refundPayment(
				orderPayments[0].id,
				refundAmount
			);
			return { success: true, refundInfo };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	}
};
