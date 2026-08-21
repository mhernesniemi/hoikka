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

	// `state_referenced_locally` fires whenever `$state` is seeded from a prop's
	// initial value (e.g. `let visibility = $state(data.product.visibility)`) —
	// the intended pattern for editable draft state throughout this codebase,
	// not a bug. Silenced globally rather than per-site to avoid ~40 ignore
	// comments across admin edit pages.
	onwarn: (warning, defaultHandler) => {
		if (warning.code === "state_referenced_locally") return;
		defaultHandler(warning);
	},

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
