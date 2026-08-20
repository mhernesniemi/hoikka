/**
 * Drains the outbox on demand. Called by:
 *   - Cloudflare: the companion cron worker — see workers/cron.ts + wrangler.cron.jsonc
 *   - Node: the startup interval — see src/hooks.server.ts
 *   - You / an external cron: `curl -H "authorization: Bearer $TASKS_SECRET" .../api/tasks/run`
 *
 * Guarded by TASKS_SECRET. The endpoint drains the outbox and can run
 * housekeeping, so it is only ever open without one when SvelteKit itself says
 * we are in local development — NODE_ENV is not a reliable signal here, because
 * Worker bindings do not set it and `undefined !== "production"` would leave
 * this wide open in production on Cloudflare.
 */
import { json, error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { secretMatches } from "$lib/server/secrets.js";
import { drainOutbox } from "$lib/server/integrations/events.js";
import { runHousekeeping } from "$lib/server/integrations/scheduler.js";
import type { RequestHandler } from "./$types.js";

function authorized(request: Request): boolean {
	const secret = env.TASKS_SECRET;
	if (!secret) {
		if (!dev) {
			console.error("[tasks] TASKS_SECRET is not set — refusing to run");
		}
		return dev;
	}

	const header = request.headers.get("authorization") ?? "";
	const prefix = "Bearer ";
	if (!header.startsWith(prefix)) return false;
	return secretMatches(header.slice(prefix.length), secret);
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (!authorized(request)) throw error(401, "Unauthorized");

	const result = await drainOutbox();

	// Housekeeping (stale drafts, spent counters, old outbox rows) is cheap but
	// not per-minute work — the cron worker asks for it with ?housekeeping=1,
	// and it runs hourly on the Node interval.
	if (url.searchParams.get("housekeeping") === "1") {
		await runHousekeeping();
	}

	return json(result);
};
