import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateSQLiteDrizzleJson } from "drizzle-kit/api";
import * as schema from "./schema.js";
import { pendingMigrationStatements } from "./migrations-check.js";

let dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs = [];
});

/** A migrations folder whose journal has two entries, only the first with a snapshot. */
async function committed(snapshot: Record<string, unknown>): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "hoikka-check-"));
	dirs.push(dir);
	mkdirSync(join(dir, "meta"));
	writeFileSync(
		join(dir, "meta", "0000_snapshot.json"),
		JSON.stringify(await generateSQLiteDrizzleJson(snapshot))
	);
	writeFileSync(
		join(dir, "meta", "_journal.json"),
		JSON.stringify({
			version: "7",
			dialect: "sqlite",
			entries: [
				{ idx: 0, when: 1, tag: "0000_init" },
				{ idx: 1, when: 2, tag: "0001_custom" }
			]
		})
	);
	return dir;
}

const notes = sqliteTable("notes", { id: text("id").primaryKey() });

describe("pendingMigrationStatements", () => {
	it("finds nothing pending in this repo", async () => {
		expect(await pendingMigrationStatements(schema, "drizzle")).toEqual([]);
	});

	it("is empty when the schema matches the latest snapshot", async () => {
		expect(await pendingMigrationStatements({ notes }, await committed({ notes }))).toEqual([]);
	});

	it("reports a schema change that has no migration", async () => {
		const withBody = sqliteTable("notes", { id: text("id").primaryKey(), body: text("body") });
		const statements = await pendingMigrationStatements(
			{ notes: withBody },
			await committed({ notes })
		);
		expect(statements.join("\n")).toMatch(/ALTER TABLE `notes` ADD `body`/);
	});

	it("fails without a migrations folder", async () => {
		await expect(pendingMigrationStatements({ notes }, "does-not-exist")).rejects.toThrow(
			/No migrations/
		);
	});
});
