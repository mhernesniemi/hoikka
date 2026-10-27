/**
 * drizzle-kit rebuilds a SQLite table (create __new_x, copy, drop x, rename)
 * whenever a column change can't be done with ALTER. With foreign keys on,
 * the drop cascades into every child table — 0006 rebuilds digital_downloads.
 */
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "./node.js";

const BREAK = "--> statement-breakpoint\n";

const CREATE = [
	"CREATE TABLE `parents` (`id` integer PRIMARY KEY NOT NULL, `name` text NOT NULL);\n",
	"CREATE TABLE `children` (`id` integer PRIMARY KEY NOT NULL, `parent_id` integer NOT NULL REFERENCES `parents`(`id`) ON DELETE cascade);\n"
].join(BREAK);

// What drizzle-kit generates for a parent column change
const REBUILD = [
	"PRAGMA foreign_keys=OFF;\n",
	"CREATE TABLE `__new_parents` (`id` integer PRIMARY KEY NOT NULL, `name` text NOT NULL, `note` text);\n",
	"INSERT INTO `__new_parents`(`id`, `name`) SELECT `id`, `name` FROM `parents`;\n",
	"DROP TABLE `parents`;\n",
	"ALTER TABLE `__new_parents` RENAME TO `parents`;\n",
	"PRAGMA foreign_keys=ON;\n"
].join(BREAK);

let dirs: string[] = [];

function migrationsFolder(migrations: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "hoikka-migrations-"));
	dirs.push(dir);
	mkdirSync(join(dir, "meta"));
	const entries = Object.entries(migrations).map(([tag, body], idx) => {
		writeFileSync(join(dir, `${tag}.sql`), body);
		return { idx, version: "6", when: 1_700_000_000_000 + idx, tag, breakpoints: true };
	});
	writeFileSync(
		join(dir, "meta", "_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries })
	);
	return dir;
}

afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs = [];
});

function openDb() {
	const sqlite = new Database(":memory:");
	sqlite.pragma("foreign_keys = ON");
	return sqlite;
}

describe("applyMigrations", () => {
	it("keeps cascade children when a parent table is rebuilt", () => {
		const sqlite = openDb();
		applyMigrations(sqlite, migrationsFolder({ "0000_create": CREATE }));
		sqlite.exec(
			"INSERT INTO parents (id, name) VALUES (1, 'p'); INSERT INTO children (id, parent_id) VALUES (1, 1);"
		);

		applyMigrations(
			sqlite,
			migrationsFolder({ "0000_create": CREATE, "0001_rebuild": REBUILD })
		);

		expect(sqlite.prepare("SELECT count(*) AS n FROM children").get()).toEqual({ n: 1 });
		expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
	});

	it("fails loudly when a migration leaves dangling references", () => {
		const sqlite = openDb();
		applyMigrations(sqlite, migrationsFolder({ "0000_create": CREATE }));
		sqlite.exec(
			"INSERT INTO parents (id, name) VALUES (1, 'p'); INSERT INTO children (id, parent_id) VALUES (1, 1);"
		);

		expect(() =>
			applyMigrations(
				sqlite,
				migrationsFolder({
					"0000_create": CREATE,
					"0001_orphan": "DELETE FROM `parents`;\n"
				})
			)
		).toThrow(/1 foreign key violation/);
		expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
	});
});
