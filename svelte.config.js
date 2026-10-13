import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { resolveTarget } from "./hoikka-target.js";

const target = resolveTarget();

const adapter =
	target === "cloudflare"
		? (await import("@sveltejs/adapter-cloudflare")).default({ platformProxy: {} })
		: (await import("@sveltejs/adapter-node")).default();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter,
		// hoikka.config.ts lives at the project root (it is project-owned in
		// both distribution modes); this alias is how core code reaches it.
		alias: {
			"$hoikka/config": "./hoikka.config.ts"
		},
		// Inline page CSS into the HTML: removes the render-blocking stylesheet
		// request, which is the FCP floor on throttled mobile. Pages are
		// edge-cached, so the extra document bytes are effectively free.
		inlineStyleThreshold: 24 * 1024,
		experimental: {
			remoteFunctions: true
		}
	},

	compilerOptions: {
		experimental: {
			async: true
		}
	},

	vitePlugin: {
		inspector: true
	}
};

export default config;
