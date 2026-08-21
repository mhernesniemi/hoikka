import { orderService } from "@hoikka/core/server/services/orders";
import { shippingService, paymentService } from "@hoikka/core/server/services/index";
import { digitalDeliveryService } from "@hoikka/core/server/services/digitalDelivery";
import { emitEvent } from "@hoikka/core/server/integrations/events";
import { error, fail } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ params }: ServerLoadEvent) => {
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

	// Load payment info — the one that carries the money, not a superseded row
	const payment = await paymentService.getPrimaryForOrder(id);
	let paymentMethod = null;
	if (payment) {
		paymentMethod = await paymentService.getMethodById(payment.paymentMethodId);
	}

	return { order, orderShipping, shippingMethod, payment, paymentMethod };
};

export const actions = {
	transition: async ({ params, request }: RequestEvent) => {
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

	updateShippingStatus: async ({ params, request }: RequestEvent) => {
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

	trackShipment: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			const status = await shippingService.trackShipment(id);
			return { success: true, trackingStatus: status };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	confirmPayment: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			const payment = await paymentService.getPrimaryForOrder(id);
			if (!payment) {
				return fail(404, { error: "No payment found for this order" });
			}

			const verification = await paymentService.confirmPayment(payment.id);
			return { success: true, paymentStatus: verification.status };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	/**
	 * Re-run digital fulfilment for an order the delivery failed on. The grants
	 * are recreated if needed and the delivery email is queued again.
	 */
	retryFulfillment: async ({ params }: RequestEvent) => {
		const id = Number(params.id);

		try {
			const grants = await digitalDeliveryService.createGrants(id);

			// Set or clear on the same path: a retry that finally succeeds has to
			// take the alert down, whether or not it had to create anything.
			await orderService.setFulfillmentIssue(
				id,
				"downloads",
				grants.errors.length > 0 ? grants.errors.join("; ") : null
			);
			if (grants.errors.length > 0) {
				return fail(400, { error: grants.errors.join("; ") });
			}

			if (grants.granted > 0) {
				await emitEvent("order.digital_delivery", { orderId: id }, { maxAttempts: 8 });
			}
			return { success: true };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	refundPayment: async ({ params, request }: RequestEvent) => {
		const id = Number(params.id);
		const formData = await request.formData();
		const amount = formData.get("amount")?.toString();

		try {
			const payment = await paymentService.getPrimaryForOrder(id);
			if (!payment) {
				return fail(404, { error: "No payment found for this order" });
			}

			const refundAmount = amount ? parseInt(amount) : undefined;
			const refundInfo = await paymentService.refundPayment(payment.id, refundAmount);
			return { success: true, refundInfo };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	}
};
