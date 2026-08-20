/**
 * Database client seam for both deployment targets.
 *
 * - Node: a lazily created better-sqlite3 singleton (migrates on first use).
 * - Cloudflare: a per-request drizzle client over the D1 binding
 *   (`platform.env.DB`), cached on `event.locals`.
 *
 * `db` is a Proxy so that module-scope consumers (e.g. Better Auth's
 * drizzleAdapter) can hold a stable reference while the actual backend is
 * resolved per call.
 */
import { getRequestEvent } from "$app/server";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema.js";
import { env } from "$env/dynamic/private";
// $lib specifier (not "./node.js") so the cloudflare build can alias this
// module to node-stub.ts — see resolve.alias in vite.config.ts
import { createNodeDb, type NodeDb } from "$lib/server/db/node.js";
import { DEFAULT_DATABASE_URL } from "./config.js";

// The shared surface of both drivers. `transaction` is deliberately excluded:
// it type-checks on better-sqlite3 but D1 has no interactive transactions, so
// it would blow up in production. Use `atomic()` for multi-statement writes.
export type Db = Omit<NodeDb, "transaction">;

let nodeDb: NodeDb | null = null;

function currentDb(): Db {
	try {
		const event = getRequestEvent();
		const d1 = event.platform?.env?.DB;
		if (d1) {
			const locals = event.locals as { __db?: Db };
			locals.__db ??= drizzleD1(d1, { schema }) as unknown as Db;
			return locals.__db;
		}
	} catch {
		// Outside request scope (startup, tests) — fall through to the Node db.
	}
	if (!nodeDb) {
		nodeDb = createNodeDb(env.DATABASE_URL || DEFAULT_DATABASE_URL);
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
 * Run several write statements atomically on both targets.
 *
 * D1 has no interactive transactions but executes `batch()` as one implicit
 * transaction; better-sqlite3 has no `batch()` but runs a synchronous
 * transaction on its single connection. Pass unexecuted drizzle statements
 * (don't await them yourself).
 */
export async function atomic(statements: readonly BatchItem<"sqlite">[]): Promise<void> {
	if (statements.length === 0) return;
	const backend = currentDb();
	if ("batch" in backend && typeof backend.batch === "function") {
		await (backend as { batch(s: readonly BatchItem<"sqlite">[]): Promise<unknown> }).batch(
			statements
		);
		return;
	}

	// better-sqlite3 is a single connection shared by every request in the
	// process, and it is *synchronous*. So the batch must run without ever
	// yielding: an earlier version issued BEGIN and then awaited each statement,
	// which handed control back to the event loop mid-transaction and let
	// unrelated writes from other requests land inside it — to be committed
	// early, or rolled back along with it. Driving the statements synchronously
	// inside the driver's own transaction() closes that window completely,
	// because nothing else in the process can run until it returns.
	const node = backend as unknown as { transaction<T>(fn: () => T): T };
	node.transaction(() => {
		for (const statement of statements) {
			// Query builders expose run(); a raw db.run(sql`...`) exposes
			// execute(). Both are synchronous on this driver.
			const runnable = statement as unknown as {
				run?: () => unknown;
				execute?: () => unknown;
			};
			if (typeof runnable.run === "function") runnable.run();
			else if (typeof runnable.execute === "function") runnable.execute();
			else throw new Error("atomic(): statement cannot be run synchronously");
		}
	});
}
