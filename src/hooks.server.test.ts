/**
 * Regression tests for the admin authorization hook.
 *
 * The admin layout's `load` cannot protect form actions or endpoints — those
 * run before layout loads — so every admin request has to be stopped here.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));

const customersConfig = vi.hoisted(() => ({ signUp: true, requireSignIn: false }));
vi.mock("$lib/config/customers.js", () => ({
	get SIGN_UP_ENABLED() {
		return customersConfig.signUp;
	},
	get SIGN_IN_REQUIRED() {
		return customersConfig.requireSignIn;
	}
}));

import { adminGuard, bodyLimitGuard, signInGuard, signUpGuard } from "./hooks.server.js";
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

describe("signUpGuard", () => {
	const OK = new Response("resolved");

	async function run(pathname: string, signUp: boolean): Promise<Response> {
		customersConfig.signUp = signUp;
		const event = {
			url: new URL(`http://localhost${pathname}`),
			request: new Request(`http://localhost${pathname}`, { method: "POST" })
		} as unknown as Parameters<typeof signUpGuard>[0]["event"];
		return (await signUpGuard({ event, resolve: async () => OK })) as Response;
	}

	it("lets sign-up requests through when sign-up is enabled", async () => {
		expect(await run("/api/auth/sign-up/email", true)).toBe(OK);
	});

	it("rejects the sign-up API with 404 when sign-up is disabled", async () => {
		expect((await run("/api/auth/sign-up/email", false)).status).toBe(404);
		expect((await run("/api/auth/sign-up", false)).status).toBe(404);
	});

	it("leaves sign-in and other auth endpoints alone when sign-up is disabled", async () => {
		expect(await run("/api/auth/sign-in/email", false)).toBe(OK);
		expect(await run("/api/auth/get-session", false)).toBe(OK);
		expect(await run("/api/auth/sign-up-extra", false)).toBe(OK);
	});
});

describe("signInGuard", () => {
	const OK = new Response("resolved");

	async function run(
		path: string,
		{ method = "GET", signedIn = false, required = true } = {}
	): Promise<Response> {
		customersConfig.requireSignIn = required;
		const event = {
			url: new URL(`http://localhost${path}`),
			request: new Request(`http://localhost${path}`, { method }),
			locals: { user: signedIn ? { id: "u1", role: "customer" } : null }
		} as unknown as Parameters<typeof signInGuard>[0]["event"];
		try {
			return (await signInGuard({ event, resolve: async () => OK })) as Response;
		} catch (thrown) {
			const redirect = thrown as { status: number; location: string };
			return new Response(null, {
				status: redirect.status,
				headers: { location: redirect.location }
			});
		}
	}

	it("leaves an open store alone", async () => {
		expect(await run("/products", { required: false })).toBe(OK);
	});

	it("sends anonymous page loads to sign-in and back", async () => {
		const response = await run("/products?page=2");
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("/sign-in?redirect=%2Fproducts%3Fpage%3D2");
		expect((await run("/")).headers.get("location")).toBe("/sign-in");
	});

	it("rejects anonymous form actions", async () => {
		expect((await run("/products/1", { method: "POST" })).status).toBe(401);
	});

	it("lets signed-in visitors through", async () => {
		expect(await run("/products", { signedIn: true })).toBe(OK);
	});

	it("keeps sign-in, auth, admin and integration endpoints reachable", async () => {
		for (const path of [
			"/sign-in",
			"/forgot-password",
			"/api/auth/sign-in/email",
			"/admin/login",
			"/api/tasks/run",
			"/api/webhooks/erp",
			"/api/health"
		]) {
			expect(await run(path, { method: path.startsWith("/api") ? "POST" : "GET" })).toBe(OK);
		}
	});
});
