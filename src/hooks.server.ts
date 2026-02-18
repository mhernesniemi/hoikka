/**
 * Server hooks for authentication, customer sync, and cart handling
 * Uses Neon Auth for authentication
 */
import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, HandleServerError } from "@sveltejs/kit";
import { db } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { orderService } from "$lib/server/services/orders.js";
import { shippingService, paymentService, wishlistService } from "$lib/server/services/index.js";
import { withSpan } from "$lib/server/telemetry.js";

const CART_COOKIE_NAME = "cart_token";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const WISHLIST_COOKIE_NAME = "wishlist_token";
const WISHLIST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// OAuth verifier handler — exchanges neon_auth_session_verifier for a session cookie
// After Google OAuth, Neon Auth redirects here with ?neon_auth_session_verifier=xxx
const oauthVerifierHandler: Handle = async ({ event, resolve }) => {
	const verifier = event.url.searchParams.get("neon_auth_session_verifier");
	if (!verifier) return resolve(event);

	const neonAuthUrl = env.NEON_AUTH_BASE_URL;
	if (!neonAuthUrl) return resolve(event);

	try {
		const cookie = event.request.headers.get("cookie") ?? "";
		const sessionRes = await fetch(`${neonAuthUrl}/get-session`, {
			headers: { cookie }
		});

		const redirectUrl = new URL(event.url);
		redirectUrl.searchParams.delete("neon_auth_session_verifier");

		const response = new Response(null, {
			status: 302,
			headers: { Location: redirectUrl.toString() }
		});

		if (sessionRes.ok) {
			for (const sc of sessionRes.headers.getSetCookie()) {
				response.headers.append("set-cookie", sc);
			}
		}

		return response;
	} catch (error) {
		console.error("[hooks] Failed to exchange OAuth session verifier:", error);
		return resolve(event);
	}
};

// Session handler — validates session via Neon Auth API and syncs customer record
const sessionHandler: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const neonAuthUrl = env.NEON_AUTH_BASE_URL;
	if (!neonAuthUrl) {
		console.error("[hooks] NEON_AUTH_BASE_URL is not set — auth is disabled");
	} else {
		const cookie = event.request.headers.get("cookie") ?? "";
		if (cookie) {
			try {
				const user = await withSpan("auth.validate_session", async () => {
					const sessionRes = await event.fetch(`${neonAuthUrl}/get-session`, {
						headers: { cookie }
					});
					if (sessionRes.ok) {
						const data = await sessionRes.json();
						if (data?.user) {
							return {
								...data.user,
								emailVerified: data.user.emailVerified ?? false
							};
						}
					}
					return null;
				});
				event.locals.user = user;
			} catch (error) {
				console.error("[hooks] Failed to validate session:", error);
			}
		}
	}

	// Sync to customer record (for non-admin users)
	if (event.locals.user) {
		const isAdmin = event.locals.user.role === "admin" || event.locals.user.role === "staff";

		if (!isAdmin) {
			let customer = await db.query.customers.findFirst({
				where: eq(customers.authUserId, event.locals.user.id)
			});

			if (!customer) {
				try {
					[customer] = await db
						.insert(customers)
						.values({
							authUserId: event.locals.user.id,
							email: event.locals.user.email,
							firstName: event.locals.user.name?.split(" ")[0] ?? "",
							lastName: event.locals.user.name?.split(" ").slice(1).join(" ") ?? ""
						})
						.returning();
				} catch (error) {
					console.error("[hooks] Failed to sync user to customer:", error);
				}
			}

			event.locals.customer = customer ?? null;
		} else {
			event.locals.customer = null;
		}
	} else {
		event.locals.customer = null;
	}

	event.locals.adminDark = event.cookies.get("admin-dark") === "1";

	return resolve(event);
};

// Cart handler - manages cart token for guest users and cart transfer on login
const cartHandler: Handle = async ({ event, resolve }) => {
	// Read cart token from cookie
	const cartToken = event.cookies.get(CART_COOKIE_NAME) ?? null;
	event.locals.cartToken = cartToken;

	// If logged-in customer has a guest cart token, transfer the cart
	if (event.locals.customer && cartToken) {
		try {
			await orderService.transferCartToCustomer(cartToken, event.locals.customer.id);
			// Clear the guest cart cookie after transfer
			event.cookies.delete(CART_COOKIE_NAME, { path: "/" });
			event.locals.cartToken = null;
		} catch (error) {
			// Transfer failed, likely no guest cart exists - ignore
		}
	}

	const response = await resolve(event);

	// If a new cart token was set during the request, set the cookie
	if (event.locals.newCartToken) {
		response.headers.append(
			"Set-Cookie",
			`${CART_COOKIE_NAME}=${event.locals.newCartToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CART_COOKIE_MAX_AGE}`
		);
	}

	return response;
};

// Wishlist handler - manages wishlist token for guests and transfer on login
const wishlistHandler: Handle = async ({ event, resolve }) => {
	const wishlistToken = event.cookies.get(WISHLIST_COOKIE_NAME) ?? null;
	event.locals.wishlistToken = wishlistToken;

	// Transfer guest wishlist to customer on login
	if (event.locals.customer && wishlistToken) {
		try {
			await wishlistService.transferToCustomer(wishlistToken, event.locals.customer.id);
			event.cookies.delete(WISHLIST_COOKIE_NAME, { path: "/" });
			event.locals.wishlistToken = null;
		} catch {
			// Transfer failed - ignore
		}
	}

	const response = await resolve(event);

	// Set new wishlist token cookie if created
	if (event.locals.newWishlistToken) {
		response.headers.append(
			"Set-Cookie",
			`${WISHLIST_COOKIE_NAME}=${event.locals.newWishlistToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WISHLIST_COOKIE_MAX_AGE}`
		);
	}

	return response;
};

// Shipping initialization handler - initializes default shipping methods on first startup
let shippingMethodsInitialized = false;

const shippingInit: Handle = async ({ event, resolve }) => {
	// Initialize shipping methods once on first request
	if (!shippingMethodsInitialized) {
		try {
			await shippingService.initializeDefaultMethods();
			shippingMethodsInitialized = true;
		} catch (error) {
			console.error("[hooks] Failed to initialize shipping methods:", error);
			// Don't block requests if initialization fails
		}
	}

	return resolve(event);
};

// Payment initialization handler - initializes default payment methods on first startup
let paymentMethodsInitialized = false;

const paymentInit: Handle = async ({ event, resolve }) => {
	// Initialize payment methods once on first request
	if (!paymentMethodsInitialized) {
		try {
			await paymentService.initializeDefaultMethods();
			paymentMethodsInitialized = true;
		} catch (error) {
			console.error("[hooks] Failed to initialize payment methods:", error);
			// Don't block requests if initialization fails
		}
	}

	return resolve(event);
};

// Combine handlers in sequence
export const handle = sequence(
	oauthVerifierHandler,
	sessionHandler,
	cartHandler,
	wishlistHandler,
	shippingInit,
	paymentInit
);

// Handle uncaught server errors
export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID();

	console.error("[error]", {
		id: errorId,
		status,
		message,
		url: event.url.pathname,
		method: event.request.method,
		error:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: error
	});

	return {
		message: "An unexpected error occurred",
		errorId
	};
};
