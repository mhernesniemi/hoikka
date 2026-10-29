/**
 * The env unit tests run with, in place of $app/env/private and the real .env
 * (see vitest.setup.ts). Starts as { DATABASE_URL: ":memory:" } in every test
 * file; set or delete keys to change what the code under test reads.
 */
export const testEnv = (globalThis as { __hoikkaTestEnv?: Record<string, string | undefined> })
	.__hoikkaTestEnv!;
