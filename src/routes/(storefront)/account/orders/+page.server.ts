import { orderService } from "@hoikka/core/server/services/orders";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
	const { customer } = await parent();

	if (!customer) {
		return { orders: [] };
	}

	const orders = await orderService.listForCustomer(customer.id);

	return { orders };
};
