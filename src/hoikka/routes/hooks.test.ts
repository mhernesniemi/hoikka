/**
 * Regression tests for the admin authorization hook.
 *
 * The admin layout's `load` cannot protect form actions or endpoints — those
 * run before layout loads — so every admin request has to be stopped here.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

import { adminGuard, bodyLimitGuard } from "./hooks.js";
import type { RequestEvent } from "@sveltejs/kit";

const OK = new Response("resolved");

function makeEvent(
	pathname: string,
	method = "GET",
	role?: string
): { event: RequestEvent; resolve: () => Promise<Response> } {
	const event = {
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`, { method }),
		locals: { user: role ? { id: "u1", role } : null }
	} as unknown as RequestEvent;

	return { event, resolve: async () => OK };
}

async function run(pathname: string, method = "GET", role?: string): Promise<Response> {
	const { event, resolve } = makeEvent(pathname, method, role);
	try {
		return (await adminGuard({ event, resolve })) as Response;
	} catch (redirectOrError) {
		// SvelteKit's redirect() throws a { status, location } object
		return redirectOrError as Response;
	}
}

describe("adminGuard", () => {
	it("lets storefront requests through untouched", async () => {
		expect(await run("/products/1")).toBe(OK);
		expect(await run("/checkout", "POST")).toBe(OK);
	});

	it("does not match paths that merely start with the same letters", async () => {
		expect(await run("/administrators")).toBe(OK);
	});

	it("lets the login and setup pages through", async () => {
		expect(await run("/admin/login")).toBe(OK);
		expect(await run("/admin/setup", "POST")).toBe(OK);
	});

	it("redirects anonymous page loads to the login screen", async () => {
		const result = (await run("/admin/products")) as unknown as {
			status: number;
			location: string;
		};
		expect(result.location).toBe("/admin/login");
	});

	it("rejects anonymous form actions instead of running them", async () => {
		const response = await run("/admin/products?/create", "POST");
		expect(response.status).toBe(401);
	});

	it("rejects an authenticated customer the same way as an anonymous one", async () => {
		const response = await run("/admin/products?/create", "POST", "customer");
		expect(response.status).toBe(401);
	});

	it("rejects non-GET admin endpoint calls from customers", async () => {
		expect((await run("/admin/api/reindex", "POST", "customer")).status).toBe(401);
		expect((await run("/admin/orders/1", "DELETE", "customer")).status).toBe(401);
	});

	it("allows admin and staff", async () => {
		expect(await run("/admin/products?/create", "POST", "admin")).toBe(OK);
		expect(await run("/admin/products?/create", "POST", "staff")).toBe(OK);
		expect(await run("/admin", "GET", "admin")).toBe(OK);
	});
});

describe("bodyLimitGuard", () => {
	const OK = new Response("resolved");

	async function run(
		pathname: string,
		method: string,
		headers: Record<string, string> = {}
	): Promise<Response> {
		const event = {
			url: new URL(`http://localhost${pathname}`),
			request: new Request(`http://localhost${pathname}`, { method, headers })
		} as unknown as Parameters<typeof bodyLimitGuard>[0]["event"];
		return (await bodyLimitGuard({ event, resolve: async () => OK })) as Response;
	}

	it("ignores bodyless methods", async () => {
		expect(await run("/products", "GET")).toBe(OK);
	});

	it("lets ordinary form posts through", async () => {
		expect(await run("/admin/login", "POST", { "content-length": "2048" })).toBe(OK);
	});

	it("rejects oversized bodies everywhere except the upload route", async () => {
		const big = String(50 * 1024 * 1024);
		expect((await run("/admin/login", "POST", { "content-length": big })).status).toBe(413);
		expect((await run("/api/webhooks/stripe", "POST", { "content-length": big })).status).toBe(
			413
		);
		expect(await run("/api/assets/upload", "POST", { "content-length": big })).toBe(OK);
	});

	it("refuses chunked bodies that declare no length", async () => {
		const response = await run("/admin/login", "POST", { "transfer-encoding": "chunked" });
		expect(response.status).toBe(411);
	});
});
