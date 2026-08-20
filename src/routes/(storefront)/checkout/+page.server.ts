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
import { orderService } from "$lib/server/services/index.js";
import { isSettledState } from "$lib/server/services/order-utils.js";
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
// Generous on purpose: this counts *new* drafts per IP, and behind CGNAT or an
// office NAT one address is many shoppers. The limit exists to bound table
// growth from scripted abuse, not to police humans.
const NEW_DRAFTS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals, cookies, getClientAddress }) => {
	const checkoutToken = cookies.get(CHECKOUT_COOKIE);

	// Before treating a non-draft token as junk: it may belong to an order whose
	// money is already captured, and minting a fresh payable draft over one of
	// those is how a shopper pays twice. This load only *classifies* — settled
	// orders redirect to their receipt, a stranded one renders the page in a
	// resuming state whose completion runs as a command (a POST). Money never
	// moves on a GET; a hover-prefetch of /checkout must stay a read.
	if (checkoutToken && !(await orderService.draftExists(checkoutToken))) {
		const stranded = await orderService.getByCheckoutToken(checkoutToken);
		if (stranded && isSettledState(stranded.state)) {
			grantReceipt(cookies, stranded.checkoutToken);
			cookies.delete(CART_COOKIE, { path: "/" });
			cookies.delete(CHECKOUT_COOKIE, { path: "/" });
			redirect(303, `/checkout/thank-you?order=${stranded.code}`);
		}
		if (stranded?.state === "payment_pending") {
			return { empty: false, resuming: true, stockErrors: [] as string[] };
		}
	}

	const cartLines = parseCartCookie(cookies.get(CART_COOKIE));
	if (cartLines.length === 0) {
		return { empty: true, resuming: false, stockErrors: [] as string[] };
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
		return { empty: true, resuming: false, stockErrors };
	}

	console.log("[checkout] started", {
		orderId: order.id,
		total: order.total,
		itemCount: order.lines.length,
		customerId: locals.customer?.id ?? null
	});

	return { empty: false, resuming: false, stockErrors };
};
