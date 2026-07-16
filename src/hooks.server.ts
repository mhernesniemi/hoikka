/**
 * Server hooks for authentication and customer sync.
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
import { ensureNodeScheduler } from "$lib/server/integrations/scheduler.js";
import { edgeCache } from "$lib/server/edge-cache.js";

// Session handler — validates session via Better Auth and syncs customer record.
const sessionHandler: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	// Most storefront traffic is anonymous — skip the session DB lookup
	// entirely when no Better Auth session cookie is present. Asset requests
	// never need locals, so they skip it even for logged-in visitors.
	const hasSessionCookie = event.request.headers
		.get("cookie")
		?.includes("better-auth.session_token");
	if (!hasSessionCookie || event.url.pathname.startsWith("/uploads/")) {
		event.locals.customer = null;
		event.locals.adminDark = event.cookies.get("admin-dark") === "1";
		return resolve(event);
	}

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

// On the node target, start the background outbox drain once (no-op on CF).
const tasksInit: Handle = async ({ event, resolve }) => {
	ensureNodeScheduler();
	return resolve(event);
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

// edgeCache sits before sessionHandler so cached guest responses return
// without touching auth or the database at all
export const handle = sequence(tasksInit, demoGuard, edgeCache, sessionHandler);

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
