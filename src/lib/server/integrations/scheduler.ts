/**
 * Node target: drain the outbox on a background interval.
 *
 * Started once per server process, lazily on first request (so it never runs
 * during the build). On the Cloudflare target this is a no-op — Workers have no
 * long-lived process, so a Cron Trigger drives the drain instead (see
 * workers/cron.ts). Both call the same drainOutbox().
 */
import { env } from "$env/dynamic/private";
import { drainOutbox, pruneOutbox } from "./events.js";
import { pruneRateLimits } from "../rate-limit.js";
import { orderService } from "../services/orders.js";
import { digitalDeliveryService } from "../services/digitalDelivery.js";

/**
 * Periodic cleanup, deliberately off the request path. Runs on the Node
 * interval below and on the Cloudflare cron tick (see /api/tasks/run).
 */
export async function runHousekeeping(): Promise<void> {
	for (const [name, task] of [
		["outbox", pruneOutbox],
		["drafts", () => orderService.deleteStaleDrafts()],
		["download-grants", () => digitalDeliveryService.pruneExpiredGrants()],
		["rate-limits", pruneRateLimits]
	] as const) {
		try {
			await task();
		} catch (err) {
			console.error(`[housekeeping] ${name} failed:`, err);
		}
	}
}

const INTERVAL_MS = 60_000; // 1 minute
let started = false;

export function ensureNodeScheduler(): void {
	if (started) return;
	if (env.HOIKKA_TARGET === "cloudflare") return; // CF uses a cron trigger
	started = true;

	const tick = async () => {
		try {
			await drainOutbox();
		} catch (err) {
			console.error("[outbox] drain tick failed:", err);
		}
	};

	// setInterval keeps the process alive; unref so it never blocks a clean exit.
	const timer = setInterval(tick, INTERVAL_MS);
	timer.unref?.();

	// Occasional housekeeping — old completed events, abandoned checkout
	// drafts, spent rate-limit counters.
	const prune = setInterval(() => void runHousekeeping(), 60 * 60_000);
	prune.unref?.();
}
