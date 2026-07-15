import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	resolve: {
		alias:
			target === "cloudflare"
				? {
						"$lib/server/db/node.js": stub("./src/lib/server/db/node-stub.ts"),
						"$lib/server/storage/fs.js": stub("./src/lib/server/storage/fs-stub.ts")
					}
				: {}
	},

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
