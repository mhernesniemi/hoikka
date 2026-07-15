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
