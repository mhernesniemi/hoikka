/**
 * Fixed-window rate limiting for the few endpoints that write to the database
 * before anyone is authenticated — entering checkout, above all, which creates
 * a draft order row.
 *
 * The counters live in the database rather than in memory: Workers isolates
 * and Node processes come and go, and a limit that resets with them is not a
 * limit. A fixed window is deliberately crude — it costs one upsert and bounds
 * the worst case, which is all that is needed to stop table growth.
 */
import { eq, lt, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { rateLimits } from "./db/schema.js";

export interface RateLimitResult {
	allowed: boolean;
	/** Seconds until the current window rolls over. */
	retryAfter: number;
}

/**
 * Count one hit against `key`. Returns whether it fits inside `limit` for the
 * current `windowMs` window.
 *
 * Fails open: if the counter itself errors, the caller is let through rather
 * than the store going down over bookkeeping.
 */
export async function rateLimit(
	key: string,
	limit: number,
	windowMs: number
): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = new Date(now - (now % windowMs));

	try {
		// One statement does the whole decision: start a window, or extend the
		// one already open. The CASE is what makes a stale window restart at 1
		// — an ON CONFLICT ... WHERE would simply skip the update and return no
		// row, leaving the counter frozen and every later request allowed.
		const [row] = await db
			.insert(rateLimits)
			.values({ key, windowStart, count: 1 })
			.onConflictDoUpdate({
				target: rateLimits.key,
				set: {
					count: sql`case when ${rateLimits.windowStart} = ${windowStart.getTime()} then ${rateLimits.count} + 1 else 1 end`,
					windowStart
				}
			})
			.returning({ count: rateLimits.count });

		const count = row?.count ?? 1;
		if (count > limit) {
			return {
				allowed: false,
				retryAfter: Math.ceil((windowStart.getTime() + windowMs - now) / 1000)
			};
		}
		return { allowed: true, retryAfter: 0 };
	} catch (error) {
		console.error("[rate-limit] check failed — allowing request", {
			key,
			error: (error as Error).message
		});
		return { allowed: true, retryAfter: 0 };
	}
}

/** Drop counters whose window is long gone. Called from the scheduled drain. */
export async function pruneRateLimits(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
	await db
		.delete(rateLimits)
		.where(lt(rateLimits.windowStart, new Date(Date.now() - olderThanMs)));
}
