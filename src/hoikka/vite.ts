/**
 * The one Vite plugin a Hoikka app needs. It does four things:
 *
 * 1. On the cloudflare target, swaps the node-only modules (better-sqlite3,
 *    node:fs storage, sharp) for stubs so they never enter the Workers bundle.
 *    The aliases are PREPENDED after config merging: SvelteKit contributes a
 *    broad `$lib` alias and Vite uses the first match, so anything appended
 *    normally would never fire — this ordering bug has shipped before, see the
 *    history of this comment in vite.config.ts.
 * 2. Skips those stubs in test mode — the unit tests drive the services
 *    against a real better-sqlite3 database.
 * 3. Marks @hoikka/core noExternal so its raw TypeScript/Svelte source is
 *    compiled by the app's pipeline in SSR (this is also what makes $env and
 *    $app imports work inside package code).
 * 4. Generates a Tailwind source wrapper (node_modules/.hoikka/sources.css)
 *    with absolute @source paths into the package, so classes used by admin
 *    components are seen by Tailwind v4's scanner even when the package
 *    resolves into the pnpm store. Aliased as $hoikka/sources.css.
 */
import { realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// realpath because pnpm links packages via symlinks and Vite watches real paths
const packageDir = realpathSync(dirname(fileURLToPath(import.meta.url)));

const STUBS = [
	{
		find: "@hoikka/core/server/db/node",
		replacement: join(packageDir, "server/db/node-stub.ts")
	},
	{
		find: "@hoikka/core/server/storage/fs",
		replacement: join(packageDir, "server/storage/fs-stub.ts")
	},
	{
		find: "@hoikka/core/server/images/node",
		replacement: join(packageDir, "server/images/node-stub.ts")
	}
];

export interface HoikkaPluginOptions {
	/** "node" (default) or "cloudflare" — same value hoikka-target.js resolves. */
	target?: string;
}

export function hoikka(options: HoikkaPluginOptions = {}): Plugin {
	const target = options.target ?? "node";

	return {
		name: "hoikka",
		enforce: "post",
		config(config, env) {
			config.resolve ??= {};
			const existing = Array.isArray(config.resolve.alias) ? config.resolve.alias : [];

			// Tailwind wrapper — generated into node_modules so it is neither in
			// the user's tree nor committed; identical in both distribution modes.
			const generatedDir = join(process.cwd(), "node_modules", ".hoikka");
			mkdirSync(generatedDir, { recursive: true });
			const sourcesCss = join(generatedDir, "sources.css");
			writeFileSync(
				sourcesCss,
				[
					`@source "${join(packageDir, "admin")}";`,
					`@source "${join(packageDir, "routes")}";`,
					""
				].join("\n")
			);

			const aliases = [{ find: "$hoikka/sources.css", replacement: sourcesCss }];

			// The unit tests need the real node modules whatever the target is.
			if (target === "cloudflare" && env.mode !== "test") {
				aliases.push(...STUBS);
			}

			config.resolve.alias = [...aliases, ...existing];

			config.ssr ??= {};
			const noExternal = config.ssr.noExternal;
			config.ssr.noExternal = Array.isArray(noExternal)
				? [...noExternal, "@hoikka/core"]
				: noExternal === undefined
					? ["@hoikka/core"]
					: noExternal; // true already covers everything
		}
	};
}
