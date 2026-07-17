/**
 * atomic() against a real in-memory SQLite (full migration chain).
 * The D1 side uses the driver's batch(), which Cloudflare documents as a
 * single implicit transaction; this covers the node BEGIN/COMMIT path.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db, atomic } from "./index.js";
import { categories } from "./schema.js";

describe("atomic", () => {
	it("commits all statements together", async () => {
		await atomic([
			db.insert(categories).values({ slug: "a", name: "A" }),
			db.insert(categories).values({ slug: "b", name: "B" })
		]);
		const rows = await db.select().from(categories);
		expect(rows.map((r) => r.slug).sort()).toEqual(["a", "b"]);
	});

	it("rolls everything back when a statement fails", async () => {
		await expect(
			atomic([
				db.insert(categories).values({ slug: "c", name: "C" }),
				// duplicate slug violates the unique index — the whole batch must roll back
				db.insert(categories).values({ slug: "a", name: "Dupe" })
			])
		).rejects.toThrow();
		const rows = await db.select().from(categories);
		expect(rows.map((r) => r.slug).sort()).toEqual(["a", "b"]);
	});

	it("is a no-op for an empty statement list", async () => {
		await expect(atomic([])).resolves.toBeUndefined();
	});
});
