/**
 * Outbox runner tests against a real in-memory SQLite (full migration chain).
 * Mirrors cart-checkout.test.ts: $env/dynamic/private is mocked to ":memory:".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import { outbox } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { emitEvent, drainOutbox } from "./events.js";
import { registerHandler } from "./handlers.js";

async function clearOutbox() {
	await db.delete(outbox);
}

describe("outbox", () => {
	beforeEach(clearOutbox);

	it("processes a pending event and marks it done", async () => {
		const seen: unknown[] = [];
		registerHandler("test.ok", async (p) => void seen.push(p));

		await emitEvent("test.ok", { hello: "world" });
		const result = await drainOutbox();

		expect(result).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
		expect(seen).toEqual([{ hello: "world" }]);
		const [row] = await db.select().from(outbox);
		expect(row.status).toBe("done");
	});

	it("retries a failing handler with backoff, then marks failed", async () => {
		registerHandler("test.boom", async () => {
			throw new Error("nope");
		});

		await emitEvent("test.boom", {}, { maxAttempts: 2 });

		// First drain: attempt 1 fails, event goes back to pending with a future
		// nextAttemptAt (backoff), so a second immediate drain does nothing.
		const first = await drainOutbox();
		expect(first).toMatchObject({ processed: 1, failed: 0 });
		let [row] = await db.select().from(outbox);
		expect(row.status).toBe("pending");
		expect(row.attempts).toBe(1);
		expect(row.lastError).toContain("nope");

		const immediate = await drainOutbox();
		expect(immediate.processed).toBe(0); // backoff not elapsed

		// Force the backoff to have elapsed, drain again → attempt 2 exhausts it
		await db
			.update(outbox)
			.set({ nextAttemptAt: new Date(0) })
			.where(eq(outbox.id, row.id));
		const second = await drainOutbox();
		expect(second).toMatchObject({ processed: 1, failed: 1 });
		[row] = await db.select().from(outbox);
		expect(row.status).toBe("failed");
		expect(row.attempts).toBe(2);
	});

	it("marks an event failed when no handler is registered", async () => {
		await emitEvent("test.unhandled", {}, { maxAttempts: 1 });
		const result = await drainOutbox();
		expect(result).toMatchObject({ processed: 1, failed: 1 });
		const [row] = await db.select().from(outbox);
		expect(row.status).toBe("failed");
		expect(row.lastError).toContain("No handler");
	});

	it("respects delayMs (event not due yet)", async () => {
		registerHandler("test.delayed", async () => {});
		await emitEvent("test.delayed", {}, { delayMs: 60_000 });
		const result = await drainOutbox();
		expect(result.processed).toBe(0);
	});
});
