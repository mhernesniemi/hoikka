/**
 * Reindex all products into the product_search table.
 * Run with: bun scripts/reindex-products.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { reindexAll } from "../src/lib/server/services/reindex.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL environment variable is not set");
	process.exit(1);
}

const client = neon(DATABASE_URL);
const db = drizzle(client);

console.log("Reindexing all products...\n");

const count = await reindexAll(db);

console.log(`\nDone. ${count} products reindexed.`);
process.exit(0);
