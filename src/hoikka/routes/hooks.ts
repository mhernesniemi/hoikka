/**
 * The core request pipeline: body-size guard, background-task init, demo
 * guard, edge cache, session/customer sync, admin authorization. The app's
 * src/hooks.server.ts composes these with `sequence(...hoikkaHandles)` —
 * insert your own handles around them there.
 */
import { redirect } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit";
import { auth } from "@hoikka/core/server/auth";
import { db } from "@hoikka/core/server/db/index";
import { customers } from "@hoikka/core/server/db/schema";
import { eq } from "drizzle-orm";
import { stringify } from "devalue";
import { env } from "$env/dynamic/private";
import { ensureNodeScheduler } from "@hoikka/core/server/integrations/scheduler";
import { syncConfiguredMethods } from "@hoikka/core/server/services/method-sync";
import { edgeCache } from "@hoikka/core/server/edge-cache";

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

// Request-body ceiling. adapter-node's BODY_SIZE_LIMIT had to be raised to
// 200 MB for digital-deliverable uploads, but that knob is global — without
// this guard every endpoint (login, checkout commands, review forms) would
// accept and buffer bodies that size. Only the upload route may exceed the
// ceiling; it enforces its own per-purpose caps on the stream.
const MAX_BODY_BYTES = 1024 * 1024;
const BODY_EXEMPT_PATHS = new Set(["/api/assets/upload"]);

export const bodyLimitGuard: Handle = async ({ event, resolve }) => {
	const method = event.request.method;
	if (method === "GET" || method === "HEAD" || method === "OPTIONS") return resolve(event);
	if (BODY_EXEMPT_PATHS.has(event.url.pathname)) return resolve(event);

	const contentLength = event.request.headers.get("content-length");
	if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
		return new Response("Payload too large", { status: 413 });
	}

	// Content-Length is a claim, and HTTP/1.1 chunked encoding is the way to
	// avoid making one — refuse that combination rather than letting the
	// adapter buffer up to its global limit while the handler reads.
	const transferEncoding = event.request.headers.get("transfer-encoding");
	if (contentLength === null && transferEncoding?.toLowerCase().includes("chunked")) {
		return new Response("Length required", { status: 411 });
	}

	return resolve(event);
};

// Admin authorization. The admin layout's `load` only guards rendering —
// form actions and endpoint handlers run *before* layout loads, so a POST to
// e.g. /admin/products?/create never reached it. Enforcing the role here
// covers every admin request whatever its method.
const ADMIN_PUBLIC_PATHS = new Set(["/admin/login", "/admin/setup"]);

function isAdminRole(role: string | undefined): boolean {
	return role === "admin" || role === "staff";
}

export const adminGuard: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
	if (!isAdminPath || ADMIN_PUBLIC_PATHS.has(pathname)) return resolve(event);

	if (isAdminRole(event.locals.user?.role)) return resolve(event);

	console.warn("[admin] unauthorized_request", {
		path: pathname,
		method: event.request.method,
		userId: event.locals.user?.id ?? null
	});

	// Page loads redirect to the login screen; anything else (form actions,
	// admin API endpoints) gets a failure the client can render, in the same
	// shape SvelteKit uses for action results.
	if (event.request.method === "GET") {
		redirect(303, "/admin/login");
	}
	return new Response(
		JSON.stringify({
			type: "failure",
			status: 401,
			data: stringify({ error: "Not authorized" })
		}),
		{ status: 401, headers: { "content-type": "application/json" } }
	);
};

// On the node target, start the background outbox drain once (no-op on CF).
// Also aligns payment/shipping method rows with hoikka.config.ts, once per
// server instance.
const tasksInit: Handle = async ({ event, resolve }) => {
	ensureNodeScheduler();
	void syncConfiguredMethods();
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
/** The core handles, in the order they must run. */
export const hoikkaHandles: Handle[] = [
	bodyLimitGuard,
	tasksInit,
	demoGuard,
	edgeCache,
	sessionHandler,
	adminGuard
];

export const hoikkaHandleError: HandleServerError = async ({ error, event, status, message }) => {
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
