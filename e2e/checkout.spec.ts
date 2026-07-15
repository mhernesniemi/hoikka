import { test, expect } from "@playwright/test";

test.describe("Full checkout flow", () => {
	test("guest completes a purchase with mock payment", async ({ page, context }) => {
		// Add a product to the cart
		await page.goto("/products");
		await page.locator('a[href^="/products/"]').first().click();
		await page.waitForSelector('button:has-text("Add to Cart")', { timeout: 10000 });
		await page.click('button:has-text("Add to Cart")');
		await expect(page.locator('a[href="/checkout"]')).toBeVisible({ timeout: 5000 });

		// The cart lives in a cookie, not the database
		const cartCookie = (await context.cookies()).find((c) => c.name === "cart");
		expect(cartCookie).toBeDefined();
		expect(cartCookie!.value).toContain("%5B1%2C"); // url-encoded `[1,` version prefix

		// Enter checkout — this creates the draft order
		await page.goto("/checkout");
		await expect(page.locator("h1")).toContainText("Checkout");

		// Fill the shipping address
		await page.fill('input[name="fullName"]', "Testi Ostaja");
		await page.fill('input[name="streetLine1"]', "Mannerheimintie 1");
		await page.fill('input[name="postalCode"]', "00100");
		await page.fill('input[name="city"]', "Helsinki");
		await page.locator('form[action="?/setShippingAddress"] button[type="submit"]').click();

		// Wait until the address is saved (summary card with Edit button appears)
		await expect(page.getByRole("main").getByRole("button", { name: "Edit" })).toBeVisible({
			timeout: 10000
		});

		// Select the shipping method. The section re-renders when the address
		// action settles, which can replace the radio right after check() — so
		// retry the check-and-verify sequence as a unit.
		const shippingRadio = page.locator('input[name="shippingMethod"]').first();
		const shippingSubmit = page.locator('button:has-text("Select Shipping Method")');
		await expect(async () => {
			await shippingRadio.check();
			await expect(shippingSubmit).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });
		await shippingSubmit.click();

		// Pay with the mock provider
		const mockRadio = page.locator('input[name="paymentMethod"]').first();
		await expect(mockRadio).toBeVisible({ timeout: 5000 });
		await page.getByText("Mock Payment", { exact: true }).click();
		await page.locator('button:has-text("Place order")').click();

		// Order completes and both cart cookies are cleared
		await page.waitForURL(/\/checkout\/thank-you\?order=ORD-/, { timeout: 10000 });
		await expect(page.locator("h1")).toContainText("Thank You");

		const cookiesAfter = await context.cookies();
		expect(cookiesAfter.find((c) => c.name === "cart")).toBeUndefined();
		expect(cookiesAfter.find((c) => c.name === "checkout_token")).toBeUndefined();
	});
});
