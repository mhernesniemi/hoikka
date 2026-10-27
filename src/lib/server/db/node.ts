import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";
import { DEFAULT_MIGRATIONS_DIR } from "./config.js";

export type NodeDb = BetterSQLite3Database<typeof schema>;

/** `mustExist` refuses to create the file, so a mistyped path fails instead of starting empty. */
export function createNodeDb(
	url: string,
	migrationsFolder = DEFAULT_MIGRATIONS_DIR,
	{ mustExist = false } = {}
): NodeDb {
	if (!mustExist) mkdirSync(dirname(url), { recursive: true });
	const sqlite = openSqlite(url, mustExist);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	applyMigrations(sqlite, migrationsFolder);
	return drizzle(sqlite, { schema });
}

/**
 * Foreign keys are switched off around the migrator: it wraps each migration
 * in a transaction, where the `PRAGMA foreign_keys=OFF` drizzle-kit writes
 * into table rebuilds is a no-op, so dropping the old table would cascade.
 */
export function applyMigrations(sqlite: Database.Database, migrationsFolder: string): void {
	const appliedBefore = appliedMigrations(sqlite);
	const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
	sqlite.pragma("foreign_keys = OFF");
	try {
		migrate(drizzle(sqlite), { migrationsFolder });
	} finally {
		sqlite.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
	}

	// The check scans every table, so skip it on the usual boot with nothing to apply
	if (appliedMigrations(sqlite) === appliedBefore) return;

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

function openSqlite(url: string, mustExist: boolean): Database.Database {
	if (mustExist && !existsSync(url)) {
		throw new Error(
			`No database at ${resolve(url)} and DATABASE_MUST_EXIST is set. Check DATABASE_URL, ` +
				"or create the database once (start without DATABASE_MUST_EXIST, or `touch` the file)."
		);
	}
	return new Database(url, { fileMustExist: mustExist });
}

function appliedMigrations(sqlite: Database.Database): number {
	const table = sqlite
		.prepare(
			"select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'"
		)
		.get();
	if (!table) return 0;
	return (sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number })
		.n;
}
