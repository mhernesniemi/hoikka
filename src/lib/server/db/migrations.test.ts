/**
 * The migration chain runs against a fresh database on every unit-test run, so
 * syntax and ordering are covered. What is not covered by that is the class of
 * mistake a SQLite table rebuild invites: dropping a parent table cascades into
 * its children, and on D1 foreign keys cannot be disabled inside a migration to
 * stop it. A rebuild of order_lines would silently delete live stock
 * reservations and paid download grants.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

import { readFileSync, readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "./index.js";

const migrations = readdirSync("drizzle")
	.filter((name) => name.endsWith(".sql"))
	.sort()
	.map((name) => ({ name, body: readFileSync(`drizzle/${name}`, "utf8") }));

/** Tables that other tables cascade-delete from. */
const CASCADE_PARENTS = ["order_lines", "orders", "products", "product_variants", "assets"];

describe("migrations", () => {
	it("has migrations to check", () => {
		expect(migrations.length).toBeGreaterThan(0);
	});

	it("never rebuilds a table other rows cascade from", () => {
		const offenders = migrations.flatMap(({ name, body }) =>
			CASCADE_PARENTS.filter((table) =>
				new RegExp(`DROP TABLE\\s+\`?${table}\`?`, "i").test(body)
			).map((table) => `${name} drops ${table}`)
		);

		// Dropping any of these takes its children with it — and the
		// PRAGMA foreign_keys=OFF that drizzle emits does not apply on D1.
		expect(offenders).toEqual([]);
	});

	it("applied cleanly, leaving the guard triggers in place", async () => {
		const triggers = await db.all<{ name: string }>(
			sql`select name from sqlite_master where type = 'trigger' order by name`
		);
		const names = triggers.map((t) => t.name);

		expect(names).toContain("product_variants_stock_non_negative");
		expect(names).toContain("promotion_usages_within_customer_limit");
		expect(names).toContain("assets_not_deletable_while_sold");
	});
});
