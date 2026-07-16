import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Workaround: Cursor CLI uses eval which breaks on SvelteKit paths
// with special characters like (storefront) and [id].
// Point launch-editor at a wrapper that quotes arguments properly.
process.env.LAUNCH_EDITOR ??= "./scripts/open-in-cursor.sh";

// Same HOIKKA_TARGET switch as svelte.config.js. On the cloudflare target,
// node-only modules (better-sqlite3, node:fs storage) are swapped for stubs
// so they never enter the Workers bundle.
const target =
	process.env.HOIKKA_TARGET ??
	(() => {
		try {
			return /^HOIKKA_TARGET=["']?(\w+)/m.exec(readFileSync(".env", "utf8"))?.[1];
		} catch {
			return undefined;
		}
	})() ??
	"node";

const stub = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const STUBS = [
	{ find: "$lib/server/db/node.js", replacement: stub("./src/lib/server/db/node-stub.ts") },
	{ find: "$lib/server/storage/fs.js", replacement: stub("./src/lib/server/storage/fs-stub.ts") },
	{
		find: "$lib/server/images/node.js",
		replacement: stub("./src/lib/server/images/node-stub.ts")
	}
];

/**
 * Swap the node-only modules for their stubs on the cloudflare target.
 *
 * These cannot live in `resolve.alias`: SvelteKit contributes a broad
 * `$lib` -> src/lib alias, Vite's alias plugin uses the first entry that
 * matches, and SvelteKit's lands ahead of anything set here — so a specific
 * `$lib/server/...` entry never fires and sharp/better-sqlite3 silently end up
 * in the Workers bundle, where sharp throws on import and takes /uploads with
 * it. Prepending once the configs are merged puts these ahead of `$lib`.
 */
const stubNodeModules = (): Plugin => ({
	name: "hoikka:stub-node-modules",
	enforce: "post",
	config(config, env) {
		// The unit tests drive the services against a real better-sqlite3 db, so
		// they need the node modules whatever the deployment target is.
		if (env.mode === "test") return;
		config.resolve ??= {};
		const existing = Array.isArray(config.resolve.alias) ? config.resolve.alias : [];
		config.resolve.alias = [...STUBS, ...existing];
	}
});

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), ...(target === "cloudflare" ? [stubNodeModules()] : [])],

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: "./vite.config.ts",

				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"]
				}
			}
		]
	}
});
