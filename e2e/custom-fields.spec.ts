import { test, expect, type Page } from "@playwright/test";

/**
 * The custom-fields round trip: hoikka.config.ts declares fields on the
 * physical product type; the admin edit form renders inputs for them; saving
 * stores them in the JSON column; the storefront product page shows them.
 *
 * Requires an admin account — created through the first-run setup if the
 * database has none, signed in via the login form otherwise.
 */
const ADMIN_EMAIL = "e2e-admin@test.local";
const ADMIN_PASSWORD = "e2e-password-1";

async function signInAsAdmin(page: Page): Promise<void> {
	await page.goto("/admin");
	await page.waitForURL(/\/admin\/(login|setup)/);

	if (page.url().includes("/admin/setup")) {
		await page.fill("#name", "E2E Admin");
		await page.fill("#email", ADMIN_EMAIL);
		await page.fill("#password", ADMIN_PASSWORD);
		await page.click('button:has-text("Create admin account")');
	} else {
		// A prior test in this run already created the admin
		await page.fill('input[type="email"]', ADMIN_EMAIL);
		await page.fill('input[type="password"]', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');
	}
	await page.waitForURL(/\/admin(?!\/(login|setup))/, { timeout: 15000 });
}

test.describe("custom fields", () => {
	// One signed-in page for the whole describe: the first-run setup signs in
	// server-side, so no second trip through the login form is needed
	test.describe.configure({ mode: "serial" });
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await signInAsAdmin(page);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("admin sets a config-declared field and the storefront shows it", async () => {
		// Open the first product's edit page
		await page.goto("/admin/products");
		await page.locator('a[href^="/admin/products/"]').first().click();
		await page.waitForURL(/\/admin\/products\/\d+/);

		// The Details card renders the config-declared fields
		const material = page.locator('input[name="cf_material"]');
		await expect(material).toBeVisible();
		await material.fill("Recycled wool");
		await page.locator('input[name="cf_weightGrams"]').fill("240");

		await page.locator('button[form="product-form"][type="submit"]').click();

		// The proof is persistence, not the toast: reload and the values must
		// come back from the database.
		await page.waitForTimeout(1500);
		await page.reload();
		await expect(page.locator('input[name="cf_material"]')).toHaveValue("Recycled wool");

		// ...and appear on the storefront product page as spec lines
		const storefrontPath = await page
			.locator('a[href^="/products/"]')
			.first()
			.getAttribute("href");
		expect(storefrontPath).toBeTruthy();
		await page.goto(storefrontPath!);
		await expect(page.getByText("Material")).toBeVisible();
		await expect(page.getByText("Recycled wool")).toBeVisible();
		await expect(page.getByText("Weight (g)")).toBeVisible();
		await expect(page.getByText("240")).toBeVisible();
	});

	test("a content-page template's fields show on the storefront page", async () => {
		// The create dialog opens client-side, so wait for hydration
		await page.goto("/admin/content-pages", { waitUntil: "networkidle" });
		await page
			.getByRole("button", { name: /Add Page|Create Page/ })
			.first()
			.click();
		await page.fill('input[name="name"]', "Winter campaign");
		await page.getByRole("button", { name: "Create", exact: true }).click();
		await page.waitForURL(/\/admin\/content-pages\/\d+/);

		await page.locator('select[name="template"]').selectOption("campaign");
		await page.locator('input[name="cf_endsAt"]').fill("2026-12-24");
		await page.locator('button[form="content-page-form"][type="submit"]').click();
		await page.waitForTimeout(1500);
		// The edit form fills title/slug client-side, so the preview link needs hydration
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator('input[name="cf_endsAt"]')).toHaveValue("2026-12-24");

		// Unpublished, so this goes through the admin preview
		const previewPath = await page.getByRole("link", { name: "Preview" }).getAttribute("href");
		expect(previewPath).toContain("?preview");
		await page.goto(previewPath!);
		await expect(page.getByRole("heading", { name: "Winter campaign" })).toBeVisible();
		await expect(page.locator("dt", { hasText: "Campaign ends" })).toBeVisible();
		await expect(page.locator("dd", { hasText: "2026" })).toBeVisible();
	});
});
