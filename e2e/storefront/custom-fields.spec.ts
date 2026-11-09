import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { E2E_DB_PATH } from "../helpers.js";

/**
 * The starter storefront shows config-declared custom fields: the physical
 * product type's fields as spec lines, a page template's fields on the page.
 * Values are written straight to the database; the admin side of the round
 * trip is covered by ../custom-fields.spec.ts.
 */
test("the product page lists the product type's custom fields", async ({ page }) => {
	const sqlite = new Database(E2E_DB_PATH);
	const product = sqlite
		.prepare(
			"select id, slug from products where deleted_at is null and visibility = 'public' limit 1"
		)
		.get() as { id: number; slug: string };
	sqlite
		.prepare("update products set custom_fields = ? where id = ?")
		.run(JSON.stringify({ material: "Recycled wool", weightGrams: 240 }), product.id);
	sqlite.close();

	await page.goto(`/products/${product.id}/${product.slug}`);
	await expect(page.locator("dt", { hasText: "Material" })).toBeVisible();
	await expect(page.locator("dd", { hasText: "Recycled wool" })).toBeVisible();
	await expect(page.locator("dt", { hasText: "Weight (g)" })).toBeVisible();
	await expect(page.locator("dd", { hasText: "240" })).toBeVisible();
});

test("a content page shows its template's fields", async ({ page }) => {
	const sqlite = new Database(E2E_DB_PATH);
	const now = Date.now();
	const { lastInsertRowid } = sqlite
		.prepare(
			`insert into content_pages (title, slug, published, template, custom_fields, createdAt, updatedAt)
			 values ('Winter campaign', 'winter-campaign', 1, 'campaign', ?, ?, ?)`
		)
		.run(JSON.stringify({ endsAt: "2026-12-24" }), now, now);
	sqlite.close();

	await page.goto(`/pages/${lastInsertRowid}/winter-campaign`);
	await expect(page.getByRole("heading", { name: "Winter campaign" })).toBeVisible();
	await expect(page.locator("dt", { hasText: "Campaign ends" })).toBeVisible();
	await expect(page.locator("dd", { hasText: "2026" })).toBeVisible();
});
