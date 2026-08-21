/**
 * The config module is imported by server code, client bundles, and CLI tools
 * (via plain tsx, where $lib/$env/$app aliases do not exist). It must stay
 * dependency-free: this test fails the moment someone adds a framework or SDK
 * import to it — or a $hoikka/config import to a module that CLI scripts load.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
	/from "\$app\//,
	/from "\$env\//,
	/from "\$lib\//,
	/from "stripe"/,
	/from "resend"/,
	/from "better-auth"/,
	/from "drizzle-orm"/
];

describe("config module purity", () => {
	it("config-schema imports nothing framework- or SDK-shaped", () => {
		const dir = "src/hoikka/config";
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
			const body = readFileSync(join(dir, name), "utf8");
			for (const pattern of FORBIDDEN) {
				expect(body, `${name} matches ${pattern}`).not.toMatch(pattern);
			}
		}
	});

	it("modules on the CLI import chain do not read $hoikka/config", () => {
		// scripts/seed.ts and scripts/mcp.ts load these through plain tsx,
		// which cannot resolve the alias.
		const cliSafe = [
			"src/hoikka/server/db/config.ts",
			"src/hoikka/server/db/node.ts",
			"src/hoikka/server/db/schema.ts",
			"src/hoikka/server/services/reindex.ts",
			"src/hoikka/server/services/product-search.ts"
		];
		for (const path of cliSafe) {
			const body = readFileSync(path, "utf8");
			expect(body, `${path} must stay CLI-loadable`).not.toContain("$hoikka/config");
		}
	});
});
