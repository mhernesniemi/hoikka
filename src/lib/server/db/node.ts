import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export type NodeDb = BetterSQLite3Database<typeof schema>;

export function createNodeDb(url: string): NodeDb {
	mkdirSync(dirname(url), { recursive: true });
	const sqlite = new Database(url);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "drizzle" });
	return db;
}
