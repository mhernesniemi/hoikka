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
	applyMigrations(sqlite, "drizzle");
	return drizzle(sqlite, { schema });
}

/**
 * Foreign keys are switched off around the migrator: it wraps each migration
 * in a transaction, where the `PRAGMA foreign_keys=OFF` drizzle-kit writes
 * into table rebuilds is a no-op, so dropping the old table would cascade.
 */
export function applyMigrations(sqlite: Database.Database, migrationsFolder: string): void {
	const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
	sqlite.pragma("foreign_keys = OFF");
	try {
		migrate(drizzle(sqlite), { migrationsFolder });
	} finally {
		sqlite.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
	}

	const violations = sqlite.pragma("foreign_key_check") as {
		table: string;
		rowid: number;
		parent: string;
	}[];
	if (violations.length > 0) {
		const sample = violations
			.slice(0, 5)
			.map((v) => `${v.table} row ${v.rowid} → ${v.parent}`)
			.join(", ");
		throw new Error(`Migrations left ${violations.length} foreign key violation(s): ${sample}`);
	}
}
