/**
 * Checkout page entry.
 *
 * The cart lives in a cookie until this page: `load` calls
 * `orderService.startCheckout`, which creates (or reconciles) a draft order
 * from the cookie lines and reserves stock for 15 minutes. The load stays
 * here (queries can't set cookies) and only reconciles + sets the
 * `checkout_token` cookie — everything the page renders comes from the
 * `getCheckout` query and its commands in `$lib/remote/checkout.remote.ts`.
 */
import { orderService } from "$lib/server/services/index.js";
import {
	CART_COOKIE,
	CHECKOUT_COOKIE,
	CHECKOUT_COOKIE_OPTIONS,
	parseCartCookie
} from "$lib/server/cart-cookie.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const cartLines = parseCartCookie(cookies.get(CART_COOKIE));
	if (cartLines.length === 0) {
		return { empty: true, stockErrors: [] as string[] };
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
		return { empty: true, stockErrors };
	}

	console.log("[checkout] started", {
		orderId: order.id,
		total: order.total,
		itemCount: order.lines.length,
		customerId: locals.customer?.id ?? null
	});

	return { empty: false, stockErrors };
};
