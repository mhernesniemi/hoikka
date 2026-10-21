import { expect, type Page } from "@playwright/test";

/**
 * Open a product that can actually be bought.
 *
 * Taking the first product in the listing is not safe: these tests buy things,
 * and the dev database they run against keeps the results, so yesterday's runs
 * can leave the first product out of stock and today's fail for a reason that
 * has nothing to do with the code.
 */
export async function gotoBuyableProduct(page: Page): Promise<void> {
	await page.goto("/products");

	const links = page.locator('a[href^="/products/"]');
	const count = await links.count();
	expect(count, "the storefront has no products to test with").toBeGreaterThan(0);

	for (let i = 0; i < Math.min(count, 10); i++) {
		await page.goto("/products");
		await page.locator('a[href^="/products/"]').nth(i).click();
		await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });

		// The buy box only appears once the page has hydrated and picked a
		// variant, so this has to wait rather than sample — an instant check
		// reads "out of stock" for every product.
		try {
			await expect(page.locator('button:has-text("Add to Cart")')).toBeVisible({
				timeout: 5000
			});
			return;
		} catch {
			// Out of stock — try the next listing
		}
	}

	throw new Error("No in-stock product found in the first 10 listings — reseed the dev database");
}

const ADMIN_EMAIL = "e2e-admin@test.local";
const ADMIN_PASSWORD = "e2e-password-1";

/**
 * Sign in as the e2e admin, creating it through the first-run setup if the
 * database has none yet.
 */
export async function signInAsAdmin(page: Page): Promise<void> {
	await page.goto("/admin");
	await page.waitForURL(/\/admin\/(login|setup)/);

	if (page.url().includes("/admin/setup")) {
		await page.fill("#name", "E2E Admin");
		await page.fill("#email", ADMIN_EMAIL);
		await page.fill("#password", ADMIN_PASSWORD);
		await page.click('button:has-text("Create admin account")');
	} else {
		// A prior test in this run already created the admin. The form submits
		// through JS, so wait for hydration or it posts natively and clears.
		await page.waitForLoadState("networkidle");
		await page.fill('input[type="email"]', ADMIN_EMAIL);
		await page.fill('input[type="password"]', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');
	}
	await page.waitForURL(/\/admin(?!\/(login|setup))/, { timeout: 15000 });
}
