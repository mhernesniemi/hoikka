/**
 * `atomic()` runs on a connection shared by every request in the process. The
 * property that matters is not just "these statements commit together" but
 * "nothing else ends up inside the transaction" — a batch that yields mid-way
 * can swallow an unrelated write and commit or discard it by accident.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

import { eq } from "drizzle-orm";
import { db, atomic } from "./index.js";
import { products, rateLimits } from "./schema.js";

/** A statement that is guaranteed to fail: the key is a primary key. */
function duplicateKeyInsert(key: string) {
	return db.insert(rateLimits).values({ key, windowStart: new Date(), count: 1 });
}

let counter = 0;

function slug(): string {
	return `atomic-test-${++counter}-${Math.random().toString(36).slice(2)}`;
}

describe("atomic", () => {
	it("commits every statement together", async () => {
		const a = slug();
		const b = slug();

		await atomic([
			db.insert(products).values({ name: a, slug: a }),
			db.insert(products).values({ name: b, slug: b })
		]);

		expect(await db.select().from(products).where(eq(products.slug, a))).toHaveLength(1);
		expect(await db.select().from(products).where(eq(products.slug, b))).toHaveLength(1);
	});

	it("rolls the whole batch back when one statement fails", async () => {
		const good = slug();
		const clash = slug();
		await duplicateKeyInsert(clash);

		await expect(
			atomic([
				db.insert(products).values({ name: good, slug: good }),
				duplicateKeyInsert(clash)
			])
		).rejects.toThrow();

		expect(await db.select().from(products).where(eq(products.slug, good))).toHaveLength(0);
	});

	it("does not swallow a concurrent write that is not part of the batch", async () => {
		const bystander = slug();
		const good = slug();
		const clash = slug();
		await duplicateKeyInsert(clash);

		// A write from an unrelated request, racing a batch that is about to
		// roll back. It must survive: it was never part of that transaction.
		const [, bystanderResult] = await Promise.allSettled([
			atomic([
				db.insert(products).values({ name: good, slug: good }),
				duplicateKeyInsert(clash)
			]),
			db.insert(products).values({ name: bystander, slug: bystander })
		]);

		expect(bystanderResult.status).toBe("fulfilled");
		expect(await db.select().from(products).where(eq(products.slug, bystander))).toHaveLength(
			1
		);
		// ...while the failed batch left nothing behind
		expect(await db.select().from(products).where(eq(products.slug, good))).toHaveLength(0);
	});
});
