/**
 * Reindex all products into the FTS5 search table.
 * Run with: bun scripts/reindex-products.ts
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../src/lib/server/db/schema.js";
import { reindexAll } from "../src/lib/server/services/reindex.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL environment variable is not set");
	process.exit(1);
}

const sqlite = new Database(DATABASE_URL);
sqlite.exec("PRAGMA foreign_keys = ON;");
const db = drizzle(sqlite, { schema });

console.log("Reindexing all products...\n");

const count = await reindexAll(db);

console.log(`\nDone. ${count} products reindexed.`);
process.exit(0);
