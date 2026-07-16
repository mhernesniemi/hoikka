/**
 * Database location for the node target. The default just works — set
 * DATABASE_URL (env var or .env/.env.local) only to override it.
 *
 * Kept free of $env/SvelteKit imports so standalone tooling (drizzle.config,
 * the seed script) can share the exact same resolution.
 */
import { readFileSync } from "node:fs";

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
