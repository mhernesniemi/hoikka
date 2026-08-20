/**
 * Order confirmation.
 *
 * The order code alone is *not* an authorisation: it travels in URLs, browser
 * history and referrers. A receipt is readable by the customer who owns the
 * order, or by the browser that completed the purchase and holds the matching
 * receipt capability (see `grantReceipt`). Everything else gets a 403.
 *
 * Only a minimal receipt is returned — never the order row, which carries the
 * checkout token and the full address snapshot.
 */
import { error } from "@sveltejs/kit";
import { orderService } from "$lib/server/services/index.js";
import { digitalDeliveryService } from "$lib/server/services/digitalDelivery.js";
import { RECEIPT_COOKIE, parseReceiptCookie } from "$lib/server/cart-cookie.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const orderCode = url.searchParams.get("order");

	if (!orderCode) {
		error(400, "Order code is required");
	}

	const order = await orderService.getByCode(orderCode);

	if (!order) {
		error(404, "Order not found");
	}

	const ownsOrder = !!locals.customer && order.customerId === locals.customer.id;
	const holdsReceipt =
		!!order.checkoutToken &&
		parseReceiptCookie(cookies.get(RECEIPT_COOKIE)).includes(order.checkoutToken);

	if (!ownsOrder && !holdsReceipt) {
		error(403, "You do not have permission to view this order");
	}

	// Digital purchases are downloadable straight away — the delivery email is
	// a convenience, not the only way to reach the files.
	const downloads = await digitalDeliveryService.getGrants(order.id);

	return {
		receipt: {
			code: order.code,
			total: order.total,
			subtotal: order.subtotal,
			shipping: order.shipping,
			discount: order.discount,
			isRegisteredCustomer: order.customerId !== null,
			// Fulfilment needs a human — tell the buyer rather than only the admin
			needsAttention: !!order.fulfillmentError,
			lines: order.lines.map((line) => ({
				productName: line.productName,
				variantName: line.variantName,
				quantity: line.quantity,
				lineTotal: line.lineTotal
			}))
		},
		downloads
	};
};
