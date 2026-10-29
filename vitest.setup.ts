import { vi } from "vitest";

// On globalThis so it survives vi.resetModules(); reset for every test file
const scope = globalThis as { __hoikkaTestEnv?: Record<string, string | undefined> };
scope.__hoikkaTestEnv = { DATABASE_URL: ":memory:" };

vi.mock("$app/env/private", async () => {
	const { variables } = await import("./src/env.js");
	const env = {};
	for (const name of Object.keys(variables)) {
		Object.defineProperty(env, name, {
			enumerable: true,
			get: () => scope.__hoikkaTestEnv![name]
		});
	}
	return env;
});
