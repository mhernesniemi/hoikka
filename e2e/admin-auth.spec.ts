import { test, expect } from "@playwright/test";

/**
 * The admin layout's `load` runs *after* form actions and endpoint handlers,
 * so it can never protect them on its own. These are the requests that
 * previously reached the database while completely unauthenticated.
 */
test.describe("Admin authorization", () => {
	test("unauthenticated page loads redirect to the login screen", async ({ request }) => {
		// Asserted on the redirect itself: on a store with no admin yet, the
		// login page redirects onward to /admin/setup, so the final URL is
		// fixture-dependent while this hop is not.
		const response = await request.get("/admin/products", { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers()["location"]).toBe("/admin/login");
	});

	test("unauthenticated form actions are rejected, not executed", async ({ request }) => {
		const before = await request.post("/admin/products?/create", {
			form: { name: "Injected product", slug: "injected-product" }
		});
		expect(before.status()).toBe(401);

		// And nothing was created: no product page with that slug exists
		const search = await request.get("/products?q=Injected%20product");
		expect(await search.text()).not.toContain("injected-product");
	});

	test("unauthenticated admin endpoints are rejected", async ({ request }) => {
		expect((await request.post("/admin/api/reindex")).status()).toBe(401);
		// Page-shaped GETs are redirected to the login screen rather than failed
		const csvExport = await request.get("/admin/orders/export", { maxRedirects: 0 });
		expect(csvExport.status()).toBe(303);
		expect(csvExport.headers()["location"]).toBe("/admin/login");
	});
});
