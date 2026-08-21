/**
 * Database location for the node target. The default just works — set
 * DATABASE_URL (env var or .env/.env.local) only to override it.
 *
 * Kept free of $env/SvelteKit imports so standalone tooling (drizzle.config,
 * the seed script) can share the exact same resolution.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
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
 * The package's migration folder. Resolved by asking Node where @hoikka/core
 * is installed *from the app root* — import.meta.url is useless here because
 * the production build bundles this module into build/server/chunks, far from
 * the drizzle/ folder. Works identically for the embedded workspace link
 * (src/hoikka) and a registry install (the pnpm store); realpath because pnpm
 * links packages via symlinks and tooling wants real paths.
 *
 * The module-relative fallback covers contexts with no resolvable dependency,
 * e.g. package-internal tests run straight from the source tree.
 */
export function migrationsDir(): string {
	try {
		const require = createRequire(join(process.cwd(), "package.json"));
		const pkgJson = realpathSync(require.resolve("@hoikka/core/package.json"));
		return join(dirname(pkgJson), "drizzle");
	} catch {
		const here = realpathSync(dirname(fileURLToPath(import.meta.url)));
		return join(here, "..", "..", "drizzle");
	}
}
