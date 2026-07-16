/**
 * Transactional outbox: emit durable events and drain them out-of-band.
 *
 * `emitEvent` is a plain INSERT — call it from services in the same flow as
 * your business writes, so events can't be lost. `drainOutbox` is the "tick":
 * it processes due events with retry/backoff and is triggered per target
 * (Cloudflare cron / Node interval / manual endpoint). Nothing here assumes a
 * long-lived process, so it works the same on Node and Workers.
 */
import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { outbox } from "../db/schema.js";
import { getHandler } from "./handlers.js";
// Importing the handlers module registers the built-in handlers as a side effect.
import "./handlers.js";

const BASE_BACKOFF_MS = 30_000; // 30s, doubled per attempt

export interface EmitOptions {
	/** Delay before the first attempt (ms). Default: immediate. */
	delayMs?: number;
	/** Max attempts before the event is marked failed. Default: 5. */
	maxAttempts?: number;
}

/** Record an event to be processed out-of-band by the next drain. */
export async function emitEvent(
	type: string,
	payload: unknown,
	options: EmitOptions = {}
): Promise<void> {
	await db.insert(outbox).values({
		type,
		payload,
		nextAttemptAt: new Date(Date.now() + (options.delayMs ?? 0)),
		maxAttempts: options.maxAttempts ?? 5
	});
}

export interface DrainResult {
	processed: number;
	succeeded: number;
	failed: number;
}

/**
 * Process due pending events. Safe to call concurrently — each row is claimed
 * with a conditional UPDATE before its handler runs, so overlapping ticks
 * don't double-process. Returns a small summary.
 */
export async function drainOutbox(limit = 25): Promise<DrainResult> {
	const now = new Date();
	const due = await db
		.select()
		.from(outbox)
		.where(and(eq(outbox.status, "pending"), lte(outbox.nextAttemptAt, now)))
		.orderBy(outbox.nextAttemptAt)
		.limit(limit);

	const result: DrainResult = { processed: 0, succeeded: 0, failed: 0 };

	for (const event of due) {
		// Claim the row: only proceed if it's still pending with the same attempt
		// count (guards against a concurrent tick grabbing it first).
		const claimed = await db
			.update(outbox)
			.set({ attempts: event.attempts + 1 })
			.where(
				and(
					eq(outbox.id, event.id),
					eq(outbox.status, "pending"),
					eq(outbox.attempts, event.attempts)
				)
			)
			.returning({ id: outbox.id });
		if (claimed.length === 0) continue;

		result.processed++;
		const attempt = event.attempts + 1;
		const handler = getHandler(event.type);

		try {
			if (!handler) throw new Error(`No handler registered for "${event.type}"`);
			await handler(event.payload);
			await db
				.update(outbox)
				.set({ status: "done", lastError: null })
				.where(eq(outbox.id, event.id));
			result.succeeded++;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const exhausted = attempt >= event.maxAttempts;
			await db
				.update(outbox)
				.set({
					status: exhausted ? "failed" : "pending",
					lastError: message,
					// Exponential backoff: 30s, 60s, 120s, ...
					nextAttemptAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (attempt - 1))
				})
				.where(eq(outbox.id, event.id));
			if (exhausted) result.failed++;
			console.error(`[outbox] ${event.type} attempt ${attempt} failed: ${message}`);
		}
	}

	return result;
}

/** Delete completed events older than the given age (housekeeping). */
export async function pruneOutbox(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
	await db
		.delete(outbox)
		.where(
			and(
				eq(outbox.status, "done"),
				lte(outbox.updatedAt, new Date(Date.now() - olderThanMs))
			)
		);
}
