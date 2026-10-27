import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

const broken = vi.hoisted(() => ({ value: false }));
vi.mock("$lib/server/db/index.js", async (importOriginal) => {
	const { db } = await importOriginal<typeof import("$lib/server/db/index.js")>();
	return {
		db: {
			all: (query: Parameters<typeof db.all>[0]) =>
				broken.value ? Promise.reject(new Error("no such table: products")) : db.all(query)
		}
	};
});

import { GET, HEAD } from "./+server.js";

const call = (handler: typeof GET) => handler({} as Parameters<typeof GET>[0]) as Promise<Response>;

afterEach(() => {
	broken.value = false;
});

describe("/api/health", () => {
	it("answers 200 when the schema is in place", async () => {
		const response = await call(GET);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("answers 503 when the database doesn't", async () => {
		broken.value = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await call(HEAD);
		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});
});
