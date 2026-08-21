/**
 * Build-time stand-in for node.ts on the cloudflare target — keeps
 * better-sqlite3 (a native module) out of the Workers bundle. See the
 * `resolve.alias` block in vite.config.ts.
 */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema.js";

export type NodeDb = BetterSQLite3Database<typeof schema>;

export function createNodeDb(_url: string): NodeDb {
	throw new Error("The node database is not available on the cloudflare target");
}
