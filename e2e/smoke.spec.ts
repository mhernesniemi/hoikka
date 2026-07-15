import { test, expect } from "@playwright/test";

test.describe("Storefront smoke tests", () => {
	test("homepage loads", async ({ page }) => {
		await page.goto("/");

		await expect(page.locator("h1")).toContainText("Opinionated Commerce");
		await expect(page.locator('a[href="/products"]')).toBeVisible();
	});

	test("products page lists products", async ({ page }) => {
		await page.goto("/products");

		await expect(page.locator("h1")).toContainText("Products");

		const productCards = page.locator('a[href^="/products/"]');
		await expect(productCards.first()).toBeVisible({ timeout: 10000 });

		const count = await productCards.count();
		expect(count).toBeGreaterThan(0);
	});

	test("product detail page loads", async ({ page }) => {
		await page.goto("/products");

		const firstProduct = page.locator('a[href^="/products/"]').first();
		await firstProduct.click();

		// Product detail page has h1 with the product name
		await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });

		// "Add to Cart" button is visible
		await expect(page.locator('button:has-text("Add to Cart")')).toBeVisible();

		// Breadcrumb navigation exists
		await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible();
	});

	test("add to cart and view cart", async ({ page }) => {
		await page.goto("/products");

		// Go to first product
		await page.locator('a[href^="/products/"]').first().click();
		await page.waitForSelector('button:has-text("Add to Cart")', { timeout: 10000 });

		// Add to cart
		await page.click('button:has-text("Add to Cart")');

		// Cart sheet opens with the item
		await expect(page.locator('a[href="/checkout"]')).toBeVisible({ timeout: 5000 });

		// Cart shows at least one line item
		const cartItem = page.locator("h4.truncate");
		await expect(cartItem.first()).toBeVisible();

		// Checkout link is functional
		await expect(
			page.locator('a[href="/checkout"]:has-text("Proceed to Checkout")')
		).toBeVisible();
	});

	test("checkout page shows cart items", async ({ page }) => {
		await page.goto("/products");

		// Add a product to cart
		await page.locator('a[href^="/products/"]').first().click();
		await page.waitForSelector('button:has-text("Add to Cart")', { timeout: 10000 });
		await page.click('button:has-text("Add to Cart")');

		// Navigate to checkout
		await expect(page.locator('a[href="/checkout"]')).toBeVisible({ timeout: 5000 });
		await page.click('a[href="/checkout"]');

		// Checkout page loads
		await expect(page.locator("h1")).toContainText("Checkout");

		// Order summary shows the product
		await expect(page.locator("h2").filter({ hasText: "Order Summary" })).toBeVisible();

		// At least one line item with a price is visible
		const lineItem = page.locator(".divide-y .flex.gap-4");
		await expect(lineItem.first()).toBeVisible({ timeout: 5000 });
		await expect(lineItem.first()).toContainText("€");

		// Price breakdown is displayed (scope to main — the cart sheet stays mounted)
		await expect(page.getByRole("main").getByText("Subtotal")).toBeVisible();
		await expect(page.getByRole("main").getByText("Total").last()).toBeVisible();

		// Address form is shown (first step of checkout)
		const addressForm = page.locator('form[action="?/setShippingAddress"]');
		const contactForm = page.locator('form[action="?/setContactInfo"]');
		const hasForm =
			(await addressForm.isVisible().catch(() => false)) ||
			(await contactForm.isVisible().catch(() => false));
		expect(hasForm).toBeTruthy();
	});
});
