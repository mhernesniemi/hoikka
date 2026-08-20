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
import { error, redirect } from "@sveltejs/kit";
import { orderService, paymentService } from "$lib/server/services/index.js";
import { completeCheckout, isSettledState } from "$lib/server/services/checkout-completion.js";
import { grantReceipt } from "$lib/server/cart-cookie.js";
import { rateLimit } from "$lib/server/rate-limit.js";
import {
	CART_COOKIE,
	CHECKOUT_COOKIE,
	CHECKOUT_COOKIE_OPTIONS,
	parseCartCookie
} from "$lib/server/cart-cookie.js";
import type { PageServerLoad } from "./$types.js";

// Entering checkout without a *resolvable* draft writes a new order row, and
// that happens before anyone is authenticated. Reloading or resuming a real
// draft costs nothing; a made-up checkout_token buys nothing either, since the
// admission check is whether the token actually resolves, not whether the
// cookie is present.
const NEW_DRAFTS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals, cookies, getClientAddress }) => {
	const cartLines = parseCartCookie(cookies.get(CART_COOKIE));
	if (cartLines.length === 0) {
		return { empty: true, stockErrors: [] as string[] };
	}

	const checkoutToken = cookies.get(CHECKOUT_COOKIE);

	// Before treating a non-draft token as junk: it may belong to an order whose
	// money is already captured. Minting a fresh draft over one of those is how
	// a shopper ends up paying twice, so those are resolved rather than replaced.
	if (checkoutToken && !(await orderService.draftExists(checkoutToken))) {
		const settledOrder = await resolveCapturedOrder(checkoutToken, cookies);
		if (settledOrder) redirect(303, `/checkout/thank-you?order=${settledOrder}`);
	}

	if (!(await orderService.draftExists(checkoutToken))) {
		const { allowed, retryAfter } = await rateLimit(
			`checkout-draft:${getClientAddress()}`,
			NEW_DRAFTS_PER_HOUR,
			HOUR_MS
		);
		if (!allowed) {
			console.warn("[checkout] draft_rate_limited", { retryAfter });
			error(429, "Too many checkout attempts. Please wait a few minutes and try again.");
		}
	}

	// First DB write of the shopping flow: create/reconcile the draft order
	const {
		order,
		checkoutToken: draftToken,
		isNew,
		stockErrors
	} = await orderService.startCheckout(cartLines, {
		customerId: locals.customer?.id,
		checkoutToken
	});
	if (isNew) {
		cookies.set(CHECKOUT_COOKIE, draftToken, CHECKOUT_COOKIE_OPTIONS);
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

/**
 * If this token belongs to an order that is already paid — or was stranded
 * mid-settlement by a crash and turns out to be paid once the gateway is asked
 * — finish it and return its code. Returns null for anything still safe to
 * replace with a new draft.
 */
async function resolveCapturedOrder(
	token: string,
	cookies: Parameters<PageServerLoad>[0]["cookies"]
): Promise<string | null> {
	const order = await orderService.getByCheckoutToken(token);
	if (!order) return null;

	if (isSettledState(order.state)) {
		grantReceipt(cookies, order.checkoutToken);
		cookies.delete(CART_COOKIE, { path: "/" });
		cookies.delete(CHECKOUT_COOKIE, { path: "/" });
		return order.code;
	}

	if (order.state !== "payment_pending") return null;

	const payment = await paymentService.getPrimaryForOrder(order.id);
	if (!payment) return null;

	console.log("[checkout] resolving_stranded_order", { orderId: order.id });
	const result = await completeCheckout({
		order,
		payment,
		customerId: order.customerId ?? null,
		saveToAddressBook: false,
		cookies
	});

	// Still not settled (the gateway says pending): leave the order alone and
	// let the shopper start a fresh draft rather than blocking checkout on it.
	return result.completed ? result.orderCode : null;
}
