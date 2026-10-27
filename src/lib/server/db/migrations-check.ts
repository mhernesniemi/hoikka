/**
 * Diffs the schema against the latest committed snapshot. Any statement means
 * a schema change has no migration yet (`pnpm db:generate` was forgotten).
 * Tooling only (drizzle-kit is a dev dependency) — run via `pnpm db:check`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

export async function pendingMigrationStatements(
	schema: Record<string, unknown>,
	dir: string
): Promise<string[]> {
	const journalPath = join(dir, "meta", "_journal.json");
	if (!existsSync(journalPath)) throw new Error(`No migrations at ${dir}.`);
	const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
		entries: { idx: number }[];
	};

	// Hand-written migrations (`--custom`) may have no snapshot; the last one that does is current
	const snapshotPath = journal.entries
		.map((e) => join(dir, "meta", `${String(e.idx).padStart(4, "0")}_snapshot.json`))
		.findLast((path) => existsSync(path));
	if (!snapshotPath) throw new Error(`No migration snapshots in ${join(dir, "meta")}.`);

	const prev = JSON.parse(readFileSync(snapshotPath, "utf8"));
	const cur = await generateSQLiteDrizzleJson({ ...schema });
	return generateSQLiteMigration(prev, cur);
}
