/**
 * Node target: drain the outbox and run due tasks on a background interval.
 *
 * Started once per server process, lazily on first request (so it never runs
 * during the build). On the Cloudflare target this is a no-op — Workers have no
 * long-lived process, so a Cron Trigger drives the same tick through
 * /api/tasks/run instead (see workers/cron.ts).
 */
import { env } from "$env/dynamic/private";
import { drainOutbox } from "./events.js";
import { runDueTasks } from "./tasks.js";

const INTERVAL_MS = 60_000; // 1 minute
let started = false;

export function ensureNodeScheduler(): void {
	if (started) return;
	if (env.HOIKKA_TARGET === "cloudflare") return; // CF uses a cron trigger
	started = true;

	// Not awaited together: a long task must not hold up event delivery, and
	// the next tick skips a task that is still running.
	const tick = () => {
		drainOutbox().catch((err) => console.error("[outbox] drain tick failed:", err));
		runDueTasks().catch((err) => console.error("[tasks] tick failed:", err));
	};

	// setInterval keeps the process alive; unref so it never blocks a clean exit.
	const timer = setInterval(tick, INTERVAL_MS);
	timer.unref?.();
}
