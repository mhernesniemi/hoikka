/**
 * Server hooks for authentication, customer sync, and wishlist handling.
 * Uses Better Auth for authentication.
 */
import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, HandleServerError } from "@sveltejs/kit";
import { auth } from "$lib/server/auth.js";
import { db } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import { stringify } from "devalue";
import { env } from "$env/dynamic/private";
import { wishlistService } from "$lib/server/services/index.js";

const WISHLIST_COOKIE_NAME = "wishlist_token";
const WISHLIST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const isProduction = env.NODE_ENV === "production";

// Session handler — validates session via Better Auth and syncs customer record.
const sessionHandler: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	try {
		const result = await auth.api.getSession({ headers: event.request.headers });
		if (result?.user) {
			event.locals.user = {
				id: result.user.id,
				name: result.user.name,
				email: result.user.email,
				role: (result.user as { role?: string }).role,
				emailVerified: result.user.emailVerified
			};
		}
	} catch (error) {
		console.error("[hooks] Failed to validate session:", error);
	}

	// Sync to customer record (for non-admin users).
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

const wishlistHandler: Handle = async ({ event, resolve }) => {
	const wishlistToken = event.cookies.get(WISHLIST_COOKIE_NAME) ?? null;
	event.locals.wishlistToken = wishlistToken;

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

	if (event.locals.newWishlistToken) {
		response.headers.append(
			"Set-Cookie",
			`${WISHLIST_COOKIE_NAME}=${event.locals.newWishlistToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WISHLIST_COOKIE_MAX_AGE}${isProduction ? "; Secure" : ""}`
		);
	}

	return response;
};

const demoGuard: Handle = async ({ event, resolve }) => {
	if (
		env.DEMO_MODE === "true" &&
		event.request.method === "POST" &&
		event.url.pathname.startsWith("/admin") &&
		event.url.searchParams.get("/preview") === null
	) {
		return new Response(
			JSON.stringify({
				type: "failure",
				status: 403,
				data: stringify({ error: "This is a read-only demo. Changes are not saved." })
			}),
			{ status: 403, headers: { "content-type": "application/json" } }
		);
	}
	return resolve(event);
};

export const handle = sequence(demoGuard, sessionHandler, wishlistHandler);

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
