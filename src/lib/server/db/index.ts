/**
 * Database client seam for both deployment targets.
 *
 * - Node: a lazily created better-sqlite3 singleton (migrates on first use).
 * - Cloudflare: a drizzle client over the D1 binding (`DB`).
 *
 * `db` is a Proxy so that module-scope consumers (e.g. Better Auth's
 * drizzleAdapter) can hold a stable reference while the actual backend is
 * resolved per call.
 */
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema.js";
import { DATABASE_URL, MIGRATIONS_DIR, DATABASE_MUST_EXIST } from "$app/env/private";
// #lib specifiers (not "./node.js") so each build can swap the other target's
// module for its stub — see vite.config.ts
import { createNodeDb, type NodeDb } from "#lib/server/db/node.js";
import { bindings } from "#lib/server/cloudflare.js";
import { DEFAULT_DATABASE_URL, DEFAULT_MIGRATIONS_DIR } from "./config.js";
import { runAtomic } from "./run-atomic.js";

// The shared surface of both drivers. `transaction` is deliberately excluded:
// it type-checks on better-sqlite3 but D1 has no interactive transactions, so
// it would blow up in production. Use `atomic()` for multi-statement writes.
export type Db = Omit<NodeDb, "transaction">;

let nodeDb: NodeDb | null = null;
let d1Db: Db | null = null;

function currentDb(): Db {
	if (bindings) return (d1Db ??= drizzleD1(bindings.DB, { schema }) as unknown as Db);
	if (!nodeDb) {
		nodeDb = createNodeDb(
			DATABASE_URL || DEFAULT_DATABASE_URL,
			MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR,
			{
				mustExist: DATABASE_MUST_EXIST === "1" || DATABASE_MUST_EXIST === "true"
			}
		);
	}
	return nodeDb;
}

export const db = new Proxy({} as Db, {
	get(_target, prop) {
		const real = currentDb() as unknown as Record<string | symbol, unknown>;
		const value = real[prop];
		return typeof value === "function" ? value.bind(real) : value;
	}
});

/**
 * Run several write statements atomically on both targets. Pass unexecuted
 * drizzle statements (don't await them yourself). See ./run-atomic.ts.
 */
export async function atomic(statements: readonly BatchItem<"sqlite">[]): Promise<void> {
	await runAtomic(currentDb(), statements);
}
