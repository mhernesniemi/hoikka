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

	test("navigating to a related product keeps the buy box intact", async ({ page }) => {
		// The detail page component is reused across product→product client
		// navigations — per-product state (selected variant) must reset, or
		// price/add-to-cart silently disappear (regression test)
		await page.goto("/products");
		await page.locator('a[href^="/products/"]').first().click();
		await expect(page.locator('button:has-text("Add to Cart")')).toBeVisible();

		const related = page.locator(
			'section:has(h2:text("You May Also Like")) a[href^="/products/"]'
		);
		if ((await related.count()) === 0) return; // seed data has no related products

		const firstProductName = await page.locator("h1").textContent();
		await related.first().click();
		await expect(page.locator("h1")).not.toHaveText(firstProductName ?? "", {
			timeout: 10000
		});
		await expect(page.locator('button:has-text("Add to Cart")')).toBeVisible();
	});

	test("search-as-you-type returns FTS results", async ({ page }) => {
		await page.goto("/products");

		const searchInput = page.getByPlaceholder("Search products...");
		await searchInput.click();
		await searchInput.fill("mug");

		// Results come from the quickSearch remote query over FTS5
		await expect(page.getByText("Aurora Ceramic Mug").first()).toBeVisible({ timeout: 5000 });
	});

	test("category page lists scoped products", async ({ page }) => {
		await page.goto("/category/everyday-goods");

		await expect(page.locator("h1")).toContainText("Everyday Goods");
		const productCards = page.locator('a[href^="/products/"]');
		await expect(productCards.first()).toBeVisible({ timeout: 10000 });
	});

	test("hostile listing params don't 500", async ({ request }) => {
		// prototype-key sort, empty facet code, junk price — all must degrade gracefully
		for (const qs of ["?sort=toString", "?facet_=x", "?price_min=abc", "?page=-1"]) {
			const res = await request.get(`/products${qs}`);
			expect(res.status()).toBeLessThan(500);
		}
		const cat = await request.get("/category/everyday-goods?sort=constructor&facet_=x");
		expect(cat.status()).toBeLessThan(500);
	});

	test("facet filtering works server-side", async ({ page }) => {
		await page.goto("/products?q=mug");

		const productCards = page.locator('a[href^="/products/"]');
		await expect(productCards.first()).toBeVisible({ timeout: 10000 });
		await expect(page.getByRole("main")).toContainText("Aurora Ceramic Mug");
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
		const addressForm = page.getByTestId("address-form");
		const contactForm = page.getByTestId("contact-form");
		await expect(addressForm.or(contactForm)).toBeVisible();
	});
});
