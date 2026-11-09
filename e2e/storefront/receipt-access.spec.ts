import { test, expect, type Page } from "@playwright/test";
import { gotoBuyableProduct } from "./helpers.js";

/** Drive a full guest purchase and return the resulting order code. */
async function buySomething(page: Page): Promise<string> {
	await gotoBuyableProduct(page);
	await page.click('button:has-text("Add to Cart")');
	await expect(page.locator('a[href="/checkout"]')).toBeVisible({ timeout: 5000 });

	await page.goto("/checkout");

	const addressForm = page.getByTestId("address-form");
	await addressForm.locator('input[name="fullName"]').fill("Testi Ostaja");
	await addressForm.locator('input[name="streetLine1"]').fill("Mannerheimintie 1");
	await addressForm.locator('input[name="postalCode"]').fill("00100");
	await addressForm.locator('input[name="city"]').fill("Helsinki");
	await addressForm.getByRole("button", { name: "Continue" }).click();

	await expect(page.getByRole("main").getByRole("button", { name: "Edit" })).toBeVisible({
		timeout: 10000
	});

	const shippingRadio = page.locator('input[name="shippingMethod"]').first();
	const shippingSubmit = page.locator('button:has-text("Select Shipping Method")');
	await expect(async () => {
		await shippingRadio.check();
		await expect(shippingSubmit).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });
	await shippingSubmit.click();

	await expect(page.locator('input[name="paymentMethod"]').first()).toBeVisible({
		timeout: 5000
	});
	await page.getByText("Mock Payment", { exact: true }).click();
	await page.locator('button:has-text("Place order")').click();

	await page.waitForURL(/\/checkout\/thank-you\?order=ORD-/, { timeout: 10000 });
	return new URL(page.url()).searchParams.get("order")!;
}

/**
 * An order code is not a credential — it travels in URLs, history and
 * referrers. Reading a receipt needs either ownership of the order or the
 * capability the completing browser was handed.
 */
test.describe("Receipt access", () => {
	test("only the buying browser can read the receipt back", async ({ page, browser }) => {
		const orderCode = await buySomething(page);

		// The buyer's own browser holds the receipt capability
		await page.goto(`/checkout/thank-you?order=${orderCode}`);
		await expect(page.locator("h1")).toContainText("Thank You");

		// A browser that never made the purchase is refused, even with the code
		const stranger = await browser.newContext();
		const response = await stranger.request.get(`/checkout/thank-you?order=${orderCode}`);
		expect(response.status()).toBe(403);

		const body = await response.text();
		expect(body).not.toContain("Mannerheimintie 1");
		await stranger.close();
	});
});
