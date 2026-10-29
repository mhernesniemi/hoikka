import tailwindcss from "@tailwindcss/vite";
import { configDefaults, defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Workaround: Cursor CLI uses eval which breaks on SvelteKit paths
// with special characters like (storefront) and [id].
// Point launch-editor at a wrapper that quotes arguments properly.
process.env.LAUNCH_EDITOR ??= "./scripts/open-in-cursor.sh";

/**
 * The single deployment switch: HOIKKA_TARGET=node (default) or cloudflare.
 * Read from the environment first, then from .env so plain `pnpm build` works
 * without exporting anything. It picks the adapter, and on the cloudflare
 * target swaps node-only modules (better-sqlite3, node:fs storage, sharp) for
 * stubs so they never enter the Workers bundle.
 */
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

// Each build swaps the other target's modules for stubs, so better-sqlite3
// and sharp never enter the Workers bundle and cloudflare:workers never
// enters the node one. Unit tests drive the services against a real
// better-sqlite3 db, so they get the node modules whatever the target is.
const NODE_ONLY = ["db/node", "storage/fs", "images/node"];
const CLOUDFLARE_ONLY = ["cloudflare"];
const stubbed = target === "cloudflare" && !process.env.VITEST ? NODE_ONLY : CLOUDFLARE_ONLY;
const stubs = stubbed.map((module) => ({
	find: `#lib/server/${module}.js`,
	replacement: fileURLToPath(new URL(`./src/lib/server/${module}-stub.ts`, import.meta.url))
}));

const adapter =
	target === "cloudflare"
		? (await import("@sveltejs/adapter-cloudflare")).default({ platformProxy: {} })
		: (await import("@sveltejs/adapter-node")).default();

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter,
			preprocess: vitePreprocess(),
			// Inline page CSS into the HTML: removes the render-blocking stylesheet
			// request, which is the FCP floor on throttled mobile. Pages are
			// edge-cached, so the extra document bytes are effectively free.
			inlineStyleThreshold: 24 * 1024,
			experimental: { remoteFunctions: true },
			compilerOptions: { experimental: { async: true } },
			inspector: true
		})
	],
	resolve: { alias: stubs },
	// CSS-only packages (tw-animate-css) export just a "style" condition, which the
	// SSR build resolves layout.css @imports with
	ssr: { resolve: { externalConditions: ["style"] } },
	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: "./vite.config.ts",

				test: {
					name: "server",
					environment: "node",
					setupFiles: ["./vitest.setup.ts"],
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: [...configDefaults.exclude, "src/**/*.svelte.{test,spec}.{js,ts}"]
				}
			}
		]
	}
});
