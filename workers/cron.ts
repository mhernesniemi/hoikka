/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare companion cron worker.
 *
 * The SvelteKit worker only handles `fetch`, so a Cron Trigger can't drain the
 * outbox inline. This tiny worker does: on schedule it POSTs /api/tasks/run on
 * the store, which drains the outbox. Once an hour it also asks for
 * housekeeping (abandoned checkout drafts, spent rate-limit counters, old
 * outbox rows) — the work that must not sit on a customer's request. Deploy
 * separately:
 *
 *   wrangler deploy --config wrangler.cron.jsonc
 *
 * Set STORE_URL and TASKS_SECRET as vars/secrets on this worker; TASKS_SECRET
 * must match the store's.
 */
export interface Env {
	STORE_URL: string;
	TASKS_SECRET: string;
}

export default {
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
		// The trigger fires every minute; housekeeping only needs the top of
		// the hour.
		const housekeeping = new Date(event.scheduledTime).getUTCMinutes() === 0;
		const path = housekeeping ? "/api/tasks/run?housekeeping=1" : "/api/tasks/run";

		ctx.waitUntil(
			fetch(new URL(path, env.STORE_URL), {
				method: "POST",
				headers: { authorization: `Bearer ${env.TASKS_SECRET}` }
			}).then((res) => {
				if (!res.ok) console.error(`[cron] drain failed: ${res.status}`);
			})
		);
	}
};
