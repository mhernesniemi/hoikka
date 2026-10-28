import { describe, it, expect, vi } from "vitest";
import { ApiError, createApiClient, type ApiClientOptions } from "./api-client.js";

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** A fetch that records its calls and answers from a handler. */
function fakeFetch(handler: Handler) {
	const calls: { url: URL; init: RequestInit }[] = [];
	const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = new URL(String(input));
		calls.push({ url, init });
		return handler(url, init);
	});
	return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

const oauth = {
	tokenUrl: "https://login.example.com/token",
	clientId: "portal",
	clientSecret: "s3cret"
};

function client(handler: Handler, options: Partial<ApiClientOptions> = {}) {
	const fake = fakeFetch(handler);
	const api = createApiClient({
		baseUrl: "https://erp.example.com/odata/v1/",
		retryDelayMs: 0,
		fetch: fake.fetch,
		...options
	});
	return { api, calls: fake.calls };
}

describe("createApiClient", () => {
	it("joins paths to the base URL and parses JSON", async () => {
		const { api, calls } = client(() => json({ ok: true }));

		expect(await api.json("/Parts?$filter=x")).toEqual({ ok: true });
		expect(calls[0].url.toString()).toBe("https://erp.example.com/odata/v1/Parts?$filter=x");
		expect(new Headers(calls[0].init.headers).get("accept")).toBe("application/json");
	});

	it("caches the client-credentials token until shortly before it expires", async () => {
		vi.useFakeTimers();
		try {
			let issued = 0;
			const { api, calls } = client(
				(url) =>
					url.hostname === "login.example.com"
						? json({ access_token: `token-${++issued}`, expires_in: 3600 })
						: json({}),
				{ oauth: { ...oauth, scope: "erp.read" } }
			);

			await Promise.all([api.json("A"), api.json("B")]);
			await api.json("C");
			vi.advanceTimersByTime(3540_000);
			await api.json("D");

			const tokenCalls = calls.filter((call) => call.url.hostname === "login.example.com");
			expect(tokenCalls).toHaveLength(2);
			const form = new URLSearchParams(String(tokenCalls[0].init.body));
			expect(Object.fromEntries(form)).toEqual({
				grant_type: "client_credentials",
				client_id: "portal",
				client_secret: "s3cret",
				scope: "erp.read"
			});
			const auth = calls
				.filter((call) => call.url.hostname === "erp.example.com")
				.map((call) => new Headers(call.init.headers).get("authorization"));
			expect(auth).toEqual([
				"Bearer token-1",
				"Bearer token-1",
				"Bearer token-1",
				"Bearer token-2"
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("retries once with a fresh token on a 401", async () => {
		let issued = 0;
		const { api, calls } = client(
			(url, init) => {
				if (url.hostname === "login.example.com")
					return json({ access_token: `token-${++issued}`, expires_in: 3600 });
				const auth = new Headers(init.headers).get("authorization");
				return auth === "Bearer token-2" ? json({ ok: true }) : json({}, 401);
			},
			{ oauth }
		);

		expect(await api.json("Parts")).toEqual({ ok: true });
		expect(calls.map((call) => call.url.hostname)).toEqual([
			"login.example.com",
			"erp.example.com",
			"login.example.com",
			"erp.example.com"
		]);
	});

	it("gives up after the second 401", async () => {
		const { api, calls } = client(
			(url) =>
				url.hostname === "login.example.com"
					? json({ access_token: "revoked", expires_in: 3600 })
					: json({}, 401),
			{ oauth }
		);

		await expect(api.json("Parts")).rejects.toMatchObject({ name: "ApiError", status: 401 });
		expect(calls).toHaveLength(4);
	});

	it("retries network errors and 5xx with backoff", async () => {
		let attempt = 0;
		const { api, calls } = client(() => {
			attempt++;
			if (attempt === 1) throw new TypeError("fetch failed");
			if (attempt === 2) return json({}, 503);
			return json({ ok: true });
		});

		expect(await api.json("Parts")).toEqual({ ok: true });
		expect(calls).toHaveLength(3);
	});

	it("stops retrying after the configured retries", async () => {
		const { api, calls } = client(() => new Response("down", { status: 502 }), { retries: 1 });

		const error = await api.json("Parts").catch((err) => err);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 502, body: "down" });
		expect(calls).toHaveLength(2);
	});

	it("never retries a 4xx", async () => {
		const { api, calls } = client(() => json({ error: "bad filter" }, 400));

		await expect(api.json("Parts")).rejects.toMatchObject({ status: 400 });
		expect(calls).toHaveLength(1);
	});

	it("does not retry a POST, which may have gone through", async () => {
		const { api, calls } = client(() => json({}, 504));

		await expect(api.request("Orders", { method: "POST", body: "{}" })).rejects.toMatchObject({
			status: 504
		});
		expect(calls).toHaveLength(1);
	});

	it("times out a hung request and retries it", async () => {
		let attempt = 0;
		const { api, calls } = client(
			(_url, init) =>
				++attempt === 1
					? new Promise((_resolve, reject) =>
							init.signal!.addEventListener("abort", () =>
								reject(init.signal!.reason)
							)
						)
					: json({ ok: true }),
			{ timeoutMs: 20 }
		);

		expect(await api.json("Parts")).toEqual({ ok: true });
		expect(calls).toHaveLength(2);
	});

	it("does not retry when the caller aborts", async () => {
		const controller = new AbortController();
		const { api, calls } = client(() => {
			controller.abort();
			throw new DOMException("aborted", "AbortError");
		});

		await expect(api.json("Parts", { signal: controller.signal })).rejects.toThrow("aborted");
		expect(calls).toHaveLength(1);
	});

	it("pages an OData collection with $top and $skip", async () => {
		const all = Array.from({ length: 5 }, (_, i) => ({ id: i }));
		const { api, calls } = client((url) => {
			const top = Number(url.searchParams.get("$top"));
			const skip = Number(url.searchParams.get("$skip"));
			return json({ value: all.slice(skip, skip + top) });
		});

		expect(await api.collection("Parts?$select=id", { pageSize: 2 })).toEqual(all);
		expect(calls.map((call) => call.url.search)).toEqual([
			"?$select=id&$top=2&$skip=0",
			"?$select=id&$top=2&$skip=2",
			"?$select=id&$top=2&$skip=4"
		]);
	});

	it("fails rather than return a partial pull past the cap", async () => {
		const { api } = client(() => json({ value: [1, 2] }));

		await expect(api.collection("Parts", { pageSize: 2, maxItems: 5 })).rejects.toThrow(
			"Parts: more than 5 items, refusing a partial pull"
		);
	});
});
