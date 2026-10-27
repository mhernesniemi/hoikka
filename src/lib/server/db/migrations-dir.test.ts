import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = vi.hoisted(() => ({ DATABASE_URL: ":memory:" }) as Record<string, string>);
vi.mock("$env/dynamic/private", () => ({ env }));

import { sql } from "drizzle-orm";
import { db } from "./index.js";

const dir = mkdtempSync(join(tmpdir(), "hoikka-migrations-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("MIGRATIONS_DIR", () => {
	it("applies the migrations shipped there instead of ./drizzle", async () => {
		mkdirSync(join(dir, "meta"));
		writeFileSync(
			join(dir, "0000_marker.sql"),
			"CREATE TABLE `shipped_marker` (`id` integer);\n"
		);
		writeFileSync(
			join(dir, "meta", "_journal.json"),
			JSON.stringify({
				version: "7",
				dialect: "sqlite",
				entries: [{ idx: 0, version: "6", when: 1, tag: "0000_marker", breakpoints: true }]
			})
		);
		env.MIGRATIONS_DIR = dir;

		const tables = await db.all<{ name: string }>(
			sql`select name from sqlite_master where type = 'table' and name in ('shipped_marker', 'products')`
		);
		expect(tables.map((t) => t.name)).toEqual(["shipped_marker"]);
	});
});
