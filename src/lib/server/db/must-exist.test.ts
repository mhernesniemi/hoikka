/**
 * DATABASE_MUST_EXIST: on Node a mistyped DATABASE_URL would otherwise create
 * and migrate an empty database, and /api/health would pass.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env }));

import { sql } from "drizzle-orm";
import { createNodeDb } from "./node.js";

let dir: string;

afterEach(() => {
	vi.resetModules();
	rmSync(dir, { recursive: true, force: true });
});

/** A fresh db seam, so the lazily created singleton reads this test's env. */
async function seamWith(vars: Record<string, string | undefined>) {
	dir = mkdtempSync(join(tmpdir(), "hoikka-must-exist-"));
	Object.assign(
		env,
		{ DATABASE_URL: join(dir, "hoikka.db"), DATABASE_MUST_EXIST: undefined },
		vars
	);
	// Wrapped: resolving a promise with the Proxy itself would read `.then` and open the db
	return { db: (await import("./index.js")).db };
}

describe("DATABASE_MUST_EXIST", () => {
	it("refuses to start on a missing file, naming the path", async () => {
		const { db } = await seamWith({ DATABASE_MUST_EXIST: "1" });
		expect(() => db.all(sql`select 1`)).toThrow(/No database at .*hoikka\.db/);
		expect(existsSync(env.DATABASE_URL!)).toBe(false);
	});

	it("does not create missing directories either", () => {
		dir = mkdtempSync(join(tmpdir(), "hoikka-must-exist-"));
		const url = join(dir, "typo", "hoikka.db");
		expect(() => createNodeDb(url, undefined, { mustExist: true })).toThrow(/No database at/);
		expect(existsSync(join(dir, "typo"))).toBe(false);
	});

	it("opens and migrates an existing file, even an empty one", async () => {
		const { db } = await seamWith({ DATABASE_MUST_EXIST: "1" });
		writeFileSync(env.DATABASE_URL!, "");
		expect(await db.all(sql`select 1 from products limit 1`)).toEqual([]);
	});

	it("creates the file when unset", async () => {
		const { db } = await seamWith({});
		await db.all(sql`select 1 from products limit 1`);
		expect(existsSync(env.DATABASE_URL!)).toBe(true);
	});
});
