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

	// Occasional housekeeping — clear old completed events.
	const prune = setInterval(() => void pruneOutbox().catch(() => {}), 60 * 60_000);
	prune.unref?.();
}
