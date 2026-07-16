import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";

// The single deployment switch: HOIKKA_TARGET=node (default) or cloudflare.
// Read from the environment first, then from .env so `pnpm build` works
// without exporting anything.
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
