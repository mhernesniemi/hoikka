/**
 * Drains the outbox and runs due scheduled tasks. Called by:
 *   - Cloudflare: the companion cron worker — see workers/cron.ts + wrangler.cron.jsonc
 *   - Node: the startup interval — see src/hooks.server.ts
 *   - You / an external cron: `curl -H "authorization: Bearer $TASKS_SECRET" .../api/tasks/run`
 *
 * Guarded by TASKS_SECRET. The endpoint drains the outbox and runs tasks, so
 * it is only ever open without one when SvelteKit itself says we are in local
 * development — NODE_ENV is not a reliable signal here, because Worker
 * bindings do not set it and `undefined !== "production"` would leave this
 * wide open in production on Cloudflare.
 */
import { json, error } from "@sveltejs/kit";
import { dev } from "$app/env";
import { TASKS_SECRET } from "$app/env/private";
import { secretMatches } from "#lib/server/secrets.js";
import { drainOutbox } from "#lib/server/integrations/events.js";
import { runDueTasks } from "#lib/server/integrations/tasks.js";
import type { RequestHandler } from "./$types.js";

function authorized(request: Request): boolean {
	const secret = TASKS_SECRET;
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

export const POST: RequestHandler = async ({ request }) => {
	if (!authorized(request)) throw error(401, "Unauthorized");

	const [outbox, tasks] = await Promise.all([drainOutbox(), runDueTasks()]);
	return json({ ...outbox, tasks });
};
