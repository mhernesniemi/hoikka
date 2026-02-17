import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { workflowPlugin } from "workflow/sveltekit";

// Workaround: Cursor CLI uses eval which breaks on SvelteKit paths
// with special characters like (storefront) and [id].
// Point launch-editor at a wrapper that quotes arguments properly.
process.env.LAUNCH_EDITOR ??= "./scripts/open-in-cursor.sh";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), workflowPlugin()],

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
