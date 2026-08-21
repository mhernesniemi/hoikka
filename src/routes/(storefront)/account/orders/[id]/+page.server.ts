import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { orderService } from "@hoikka/core/server/services/orders";

export const load: PageServerLoad = async ({ params, parent }) => {
	const { customer } = await parent();

	if (!customer) {
		throw error(401, "Not authenticated");
	}

	const orderId = Number(params.id);

	if (isNaN(orderId)) {
		throw error(404, "Order not found");
	}

	const order = await orderService.getById(orderId);

	if (!order) {
		throw error(404, "Order not found");
	}

	// Make sure the order belongs to this customer
	if (order.customerId !== customer.id) {
		throw error(404, "Order not found");
	}

	return { order };
};
