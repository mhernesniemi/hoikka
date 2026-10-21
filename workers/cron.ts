/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare companion cron worker.
 *
 * The SvelteKit worker only handles `fetch`, so a Cron Trigger can't drain the
 * outbox inline. This tiny worker does: every minute it POSTs /api/tasks/run on
 * the store, which drains the outbox and runs the scheduled tasks that are
 * due (see src/lib/server/integrations/tasks.ts). Deploy separately:
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
	async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			fetch(new URL("/api/tasks/run", env.STORE_URL), {
				method: "POST",
				headers: { authorization: `Bearer ${env.TASKS_SECRET}` }
			}).then((res) => {
				if (!res.ok) console.error(`[cron] drain failed: ${res.status}`);
			})
		);
	}
};
