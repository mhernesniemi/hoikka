import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { hoikka } from "@hoikka/core/vite";
import { resolveTarget } from "./hoikka-target.js";

// Workaround: Cursor CLI uses eval which breaks on SvelteKit paths
// with special characters like (storefront) and [id].
// Point launch-editor at a wrapper that quotes arguments properly.
process.env.LAUNCH_EDITOR ??= "./scripts/open-in-cursor.sh";

// Same HOIKKA_TARGET switch as svelte.config.js. The hoikka() plugin swaps
// node-only modules for stubs on the cloudflare target, compiles the core
// package from source, and wires Tailwind scanning into it — see
// @hoikka/core/vite for the details (including the alias-ordering lesson).
const target = resolveTarget();

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), hoikka({ target })],

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: "./vite.config.ts",

				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}", "src/hoikka/node_modules/**"]
				}
			}
		]
	}
});
