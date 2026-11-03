import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { isBehindDatabase } from "./scheduler.js";

describe("node scheduler", () => {
	it("notices when another process has migrated the database further", async () => {
		expect(await isBehindDatabase()).toBe(false);
		await db.run(
			sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('newer', ${Date.now()})`
		);
		expect(await isBehindDatabase()).toBe(true);
	});
});
