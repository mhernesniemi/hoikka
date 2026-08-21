/**
 * Database location for the node target. The default just works — set
 * DATABASE_URL (env var or .env/.env.local) only to override it.
 *
 * Kept free of $env/SvelteKit imports so standalone tooling (drizzle.config,
 * the seed script) can share the exact same resolution.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DATABASE_URL = "./data/hoikka.db";

export function resolveDatabaseUrl(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	for (const file of [".env", ".env.local"]) {
		try {
			const match = /^DATABASE_URL=["']?([^"'\n]+)/m.exec(readFileSync(file, "utf8"));
			if (match) return match[1];
		} catch {
			// file missing — try the next one
		}
	}
	return DEFAULT_DATABASE_URL;
}

/**
 * The package's migration folder, resolved from this module's own location so
 * it works identically in the embedded workspace (src/hoikka/drizzle) and when
 * installed from the registry (the pnpm store). realpath because pnpm links
 * packages via symlinks and tooling wants real paths.
 */
export function migrationsDir(): string {
	const here = realpathSync(dirname(fileURLToPath(import.meta.url)));
	return join(here, "..", "..", "drizzle");
}
