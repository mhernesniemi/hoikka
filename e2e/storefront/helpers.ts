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
