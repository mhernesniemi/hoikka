/**
 * Node target: drain the outbox and run due tasks on a background interval.
 *
 * Started once per server process, lazily on first request (so it never runs
 * during the build). On the Cloudflare target this is a no-op — Workers have no
 * long-lived process, so a Cron Trigger drives the same tick through
 * /api/tasks/run instead (see workers/cron.ts).
 */
import { sql } from "drizzle-orm";
import { HOIKKA_TARGET } from "$app/env/private";
import { db } from "../db/index.js";
import { drainOutbox } from "./events.js";
import { runDueTasks } from "./tasks.js";

const INTERVAL_MS = 60_000; // 1 minute
let started = false;
let knownMigrations: number | null = null;

/**
 * True once another process has migrated the database past this one: a
 * forgotten dev server running older code would otherwise keep running its
 * tasks (an import, a sync) against data the newer code owns.
 */
export async function isBehindDatabase(): Promise<boolean> {
	const row = (await db.get(sql`SELECT count(*) AS n FROM __drizzle_migrations`)) as {
		n: number;
	};
	knownMigrations ??= row.n;
	return row.n > knownMigrations;
}

export function ensureNodeScheduler(): void {
	if (started) return;
	if (HOIKKA_TARGET === "cloudflare") return; // CF uses a cron trigger
	started = true;

	// Not awaited together: a long task must not hold up event delivery, and
	// the next tick skips a task that is still running.
	const tick = async () => {
		if (await isBehindDatabase()) {
			clearInterval(timer);
			console.error(
				"[tasks] The database has migrations this process doesn't know: a newer version " +
					"of the app is running. Scheduled tasks and outbox delivery stop here; restart this process."
			);
			return;
		}
		drainOutbox().catch((err) => console.error("[outbox] drain tick failed:", err));
		runDueTasks().catch((err) => console.error("[tasks] tick failed:", err));
	};

	// setInterval keeps the process alive; unref so it never blocks a clean exit.
	const timer = setInterval(
		() => tick().catch((err) => console.error("[tasks] tick failed:", err)),
		INTERVAL_MS
	);
	timer.unref?.();
}
