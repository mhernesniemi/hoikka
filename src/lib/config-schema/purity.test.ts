/**
 * The config module is imported by server code, client bundles, and CLI tools
 * (via plain tsx, where the $env/$app modules do not exist). It must stay
 * dependency-free: this test fails the moment someone adds a framework or SDK
 * import to it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
	/from "\$app\//,
	/from "\$env\//,
	/from "#lib\//,
	/from "stripe"/,
	/from "resend"/,
	/from "better-auth"/,
	/from "drizzle-orm"/
];

describe("config module purity", () => {
	it("config-schema imports nothing framework- or SDK-shaped", () => {
		const dir = "src/lib/config-schema";
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
			const body = readFileSync(join(dir, name), "utf8");
			for (const pattern of FORBIDDEN) {
				expect(body, `${name} matches ${pattern}`).not.toMatch(pattern);
			}
		}
	});
});
