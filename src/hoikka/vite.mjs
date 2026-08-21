/**
 * The one Vite plugin a Hoikka app needs. Plain .mjs on purpose: vite.config
 * runs in Node's own module loader (vitest/vite externalize bare imports when
 * bundling the config), and Node refuses to type-strip .ts inside
 * node_modules — so everything a config file imports from this package must
 * be plain JavaScript. It does five things:
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
 *    $app imports work inside package code) — and dedupes the libraries whose
 *    class identity crosses the package/app boundary. Two @sveltejs/kit
 *    instances mean a redirect() thrown in package code is not `instanceof`
 *    the runtime's Redirect and becomes a 500; the same goes for svelte
 *    component identity and drizzle's entity checks.
 * 4. Excludes @hoikka/core from the dev-server's dependency optimizer. In an
 *    embedded/workspace install Vite auto-detects the symlink and treats it
 *    as source, skipping the optimizer — but a real npm install (package
 *    mode, standalone) is a plain node_modules package, so without this
 *    esbuild tries to pre-bundle raw .svelte.ts files itself and chokes on
 *    the TypeScript syntax vite-plugin-svelte would otherwise have stripped.
 * (Tailwind scanning of the package is handled by two @source lines in the
 * app's layout.css pointing through node_modules/@hoikka/core — a stable path
 * in both distribution modes.)
 */
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * @typedef {{ target?: string }} HoikkaPluginOptions
 *   target: "node" (default) or "cloudflare" — same value hoikka-target.js resolves.
 */

/**
 * @param {HoikkaPluginOptions} [options]
 * @returns {import("vite").Plugin}
 */
export function hoikka(options = {}) {
	const target = options.target ?? "node";

	return {
		name: "hoikka",
		enforce: "post",
		config(config, env) {
			config.resolve ??= {};
			const existing = Array.isArray(config.resolve.alias) ? config.resolve.alias : [];

			/** @type {{ find: string; replacement: string }[]} */
			const aliases = [];

			// The unit tests need the real node modules whatever the target is.
			if (target === "cloudflare" && env.mode !== "test") {
				aliases.push(...STUBS);
			}

			config.resolve.alias = [...aliases, ...existing];
			const dedupe = config.resolve.dedupe ?? [];
			config.resolve.dedupe = [
				...dedupe,
				"@sveltejs/kit",
				"svelte",
				"drizzle-orm",
				"better-auth",
				"valibot"
			];

			config.ssr ??= {};
			const noExternal = config.ssr.noExternal;
			config.ssr.noExternal = Array.isArray(noExternal)
				? [...noExternal, "@hoikka/core"]
				: noExternal === undefined
					? ["@hoikka/core"]
					: noExternal; // true already covers everything

			config.optimizeDeps ??= {};
			const exclude = config.optimizeDeps.exclude ?? [];
			config.optimizeDeps.exclude = [...exclude, "@hoikka/core"];
		}
	};
}
