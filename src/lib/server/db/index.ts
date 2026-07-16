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
import * as schema from "./schema.js";
import { env } from "$env/dynamic/private";
// $lib specifier (not "./node.js") so the cloudflare build can alias this
// module to node-stub.ts — see resolve.alias in vite.config.ts
import { createNodeDb, type NodeDb } from "$lib/server/db/node.js";
import { DEFAULT_DATABASE_URL } from "./config.js";

export type Db = NodeDb;

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
