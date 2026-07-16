/**
 * Drains the outbox on demand. Called by:
 *   - Cloudflare: the Worker's scheduled (cron) handler — see src/hooks.server.ts
 *   - Node: the startup interval — see src/hooks.server.ts
 *   - You / an external cron: `curl -H "authorization: Bearer $TASKS_SECRET" .../api/tasks/run`
 *
 * Guarded by TASKS_SECRET when set (required in production; open in dev if unset).
 */
import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { drainOutbox } from "$lib/server/integrations/events.js";
import type { RequestHandler } from "./$types.js";

function authorized(request: Request): boolean {
	const secret = env.TASKS_SECRET;
	if (!secret) return env.NODE_ENV !== "production"; // open in dev, closed in prod
	return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!authorized(request)) throw error(401, "Unauthorized");
	return json(await drainOutbox());
};
