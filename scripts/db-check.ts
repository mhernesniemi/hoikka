/**
 * Fails (exit 1) when the schema has changes without a generated migration.
 * Run in CI: `pnpm db:check`.
 */
import * as schema from "../src/lib/server/db/schema.js";
import { pendingMigrationStatements } from "../src/lib/server/db/migrations-check.js";

const statements = await pendingMigrationStatements(schema, "drizzle");

if (statements.length > 0) {
	console.error(
		`Schema has changes without a migration. Run \`pnpm db:generate\` and commit:\n  ${statements.join("\n  ")}`
	);
	process.exit(1);
}
console.log("Migrations match the schema.");
