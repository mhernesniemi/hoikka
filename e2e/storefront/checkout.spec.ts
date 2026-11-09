import { test, expect } from "@playwright/test";
import { gotoBuyableProduct } from "./helpers.js";

test.describe("Full checkout flow", () => {
	test("guest completes a purchase with mock payment", async ({ page, context }) => {
		// Add a product to the cart
		await gotoBuyableProduct(page);
		await page.click('button:has-text("Add to Cart")');
		await expect(page.locator('a[href="/checkout"]')).toBeVisible({ timeout: 5000 });

		// The sheet updates optimistically, but the cart itself is a cookie
		// written when the addToCart command settles — poll for it
		await expect
			.poll(
				async () => (await context.cookies()).find((c) => c.name === "cart")?.value ?? "",
				{ timeout: 5000 }
			)
			.toContain("%5B1%2C"); // url-encoded `[1,` version prefix

		// Enter checkout — this creates the draft order
		await page.goto("/checkout");
		await expect(page.locator("h1")).toContainText("Checkout");

		// Fill the shipping address
		const addressForm = page.getByTestId("address-form");
		await addressForm.locator('input[name="fullName"]').fill("Testi Ostaja");
		await addressForm.locator('input[name="streetLine1"]').fill("Mannerheimintie 1");
		await addressForm.locator('input[name="postalCode"]').fill("00100");
		await addressForm.locator('input[name="city"]').fill("Helsinki");
		await addressForm.getByRole("button", { name: "Continue" }).click();

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
