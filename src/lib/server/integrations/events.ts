/**
 * Transactional outbox: emit durable events and drain them out-of-band.
 *
 * `emitEvent` is a plain INSERT — call it from services in the same flow as
 * your business writes, so events can't be lost. `drainOutbox` is the "tick":
 * it processes due events with retry/backoff and is triggered per target
 * (Cloudflare cron / Node interval / manual endpoint). Nothing here assumes a
 * long-lived process, so it works the same on Node and Workers.
 */
import { and, eq, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, outbox } from "../db/schema.js";
import { getHandler } from "./handlers.js";
// Importing the handlers module registers the built-in handlers as a side effect.
import "./handlers.js";

const BASE_BACKOFF_MS = 30_000; // 30s, doubled per attempt
// How long a claimed event is invisible to other drains while its handler
// runs. Generous on purpose: a crash mid-handler retries after the lease.
const CLAIM_LEASE_MS = 5 * 60_000;

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
	await db.insert(outbox).values(eventRow(type, payload, options));
}

function eventRow(type: string, payload: unknown, options: EmitOptions = {}) {
	return {
		type,
		payload,
		nextAttemptAt: new Date(Date.now() + (options.delayMs ?? 0)),
		maxAttempts: options.maxAttempts ?? 5
	};
}

export interface PendingEvent {
	type: string;
	payload: unknown;
	delayMs?: number;
	maxAttempts?: number;
}

/**
 * Build the inserts for several events without running them, so a caller can
 * put them in the same `atomic()` batch as the business write they belong to.
 * That is what makes "the work happened" and "the event exists" inseparable.
 *
 * `condition` is a predicate over `orders` that must still hold for the rows
 * to be written — typically "I still own the lease on this work". Expressed as
 * INSERT ... SELECT ... WHERE, so the check happens inside the same statement
 * rather than in the caller, where it would be a read that another worker can
 * invalidate before the write lands.
 */
export function pendingEvents(events: PendingEvent[], condition?: SQL) {
	return events.map((event) => {
		const row = eventRow(event.type, event.payload, event);
		if (!condition) return db.insert(outbox).values(row);

		const stamp = Date.now();
		// insert().select() requires every column, in table order.
		return db.insert(outbox).select(
			db
				.select({
					id: sql<number>`null`.as("id"),
					type: sql<string>`${row.type}`.as("type"),
					payload: sql<string>`${JSON.stringify(row.payload)}`.as("payload"),
					status: sql<string>`'pending'`.as("status"),
					attempts: sql<number>`0`.as("attempts"),
					maxAttempts: sql<number>`${row.maxAttempts}`.as("max_attempts"),
					nextAttemptAt: sql<number>`${row.nextAttemptAt.getTime()}`.as(
						"next_attempt_at"
					),
					lastError: sql<string>`null`.as("last_error"),
					createdAt: sql<number>`${stamp}`.as("createdAt"),
					updatedAt: sql<number>`${stamp}`.as("updatedAt")
				})
				.from(orders)
				.where(condition)
		);
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
		// count (guards against a concurrent tick grabbing it first). The claim
		// also pushes nextAttemptAt forward as a lease — without it the row stays
		// "due", and any handler outliving one drain interval gets picked up
		// again by the next tick and double-processed. Success/failure below
		// overwrites the lease with the real outcome.
		const claimed = await db
			.update(outbox)
			.set({
				attempts: event.attempts + 1,
				nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS)
			})
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

		// Fence every write this worker makes on the claim it actually holds. A
		// handler that outlives the lease loses the row to a replacement, and
		// must not then be able to overwrite the replacement's result — writing
		// "done" back to "pending" would hand the same email or webhook to a
		// third worker.
		const stillOurs = and(
			eq(outbox.id, event.id),
			eq(outbox.status, "pending"),
			eq(outbox.attempts, attempt)
		);

		try {
			if (!handler) throw new Error(`No handler registered for "${event.type}"`);
			await handler(event.payload, {
				eventId: event.id,
				attempt,
				idempotencyKey: `hoikka-outbox-${event.id}`
			});
			const [done] = await db
				.update(outbox)
				.set({ status: "done", lastError: null })
				.where(stillOurs)
				.returning({ id: outbox.id });
			if (done) result.succeeded++;
			else
				console.warn(`[outbox] ${event.type} #${event.id} finished after losing its lease`);
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
				.where(stillOurs);
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
