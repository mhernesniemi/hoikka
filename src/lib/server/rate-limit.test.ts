/**
 * The checkout draft limiter is the only thing between an unauthenticated
 * client and unbounded order rows, so its window behaviour matters.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

import { rateLimit, pruneRateLimits } from "./rate-limit.js";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { rateLimits } from "./db/schema.js";

const WINDOW = 60_000;

describe("rateLimit", () => {
	it("allows up to the limit and refuses beyond it", async () => {
		const key = `test-allow-${Math.random()}`;

		for (let i = 0; i < 3; i++) {
			expect((await rateLimit(key, 3, WINDOW)).allowed).toBe(true);
		}

		const blocked = await rateLimit(key, 3, WINDOW);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	it("counts each key separately", async () => {
		const a = `test-a-${Math.random()}`;
		const b = `test-b-${Math.random()}`;

		await rateLimit(a, 1, WINDOW);
		expect((await rateLimit(a, 1, WINDOW)).allowed).toBe(false);
		expect((await rateLimit(b, 1, WINDOW)).allowed).toBe(true);
	});

	it("starts a fresh count when the window rolls over, and still blocks after", async () => {
		const key = `test-window-${Math.random()}`;

		await rateLimit(key, 1, WINDOW);
		expect((await rateLimit(key, 1, WINDOW)).allowed).toBe(false);

		// Age the stored window past the boundary
		await db
			.update(rateLimits)
			.set({ windowStart: new Date(Date.now() - WINDOW * 5) })
			.where(eq(rateLimits.key, key));

		// The new window starts at one...
		expect((await rateLimit(key, 1, WINDOW)).allowed).toBe(true);
		// ...and keeps counting, rather than the counter being stuck open
		expect((await rateLimit(key, 1, WINDOW)).allowed).toBe(false);

		const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
		expect(row.count).toBe(2);
	});

	it("drops counters whose window is long gone", async () => {
		const key = `test-prune-${Math.random()}`;
		await rateLimit(key, 5, WINDOW);
		await db
			.update(rateLimits)
			.set({ windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000) })
			.where(eq(rateLimits.key, key));

		await pruneRateLimits();

		expect(await db.select().from(rateLimits).where(eq(rateLimits.key, key))).toHaveLength(0);
	});
});
