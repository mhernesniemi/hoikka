/**
 * The store's public origin, for links that live outside a request (emails,
 * webhooks). Prefers the current request when there is one, falling back to
 * configuration for background work such as outbox handlers.
 */
import { getRequestEvent } from "$app/server";
import { PUBLIC_STORE_URL, BETTER_AUTH_URL } from "$app/env/private";

export function storeOrigin(): string {
	try {
		return getRequestEvent().url.origin;
	} catch {
		// Outside request scope (outbox drain, cron) — fall back to config.
	}

	return (PUBLIC_STORE_URL || BETTER_AUTH_URL || "http://localhost:5173").replace(/\/+$/, "");
}
