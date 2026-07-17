/**
 * The single deployment switch: HOIKKA_TARGET=node (default) or cloudflare.
 * Read from the environment first, then from .env so plain `pnpm build` works
 * without exporting anything. Shared by svelte.config.js and vite.config.ts.
 */
import { readFileSync } from "node:fs";

export function resolveTarget() {
	return (
		process.env.HOIKKA_TARGET ??
		(() => {
			try {
				return /^HOIKKA_TARGET=["']?(\w+)/m.exec(readFileSync(".env", "utf8"))?.[1];
			} catch {
				return undefined;
			}
		})() ??
		"node"
	);
}
