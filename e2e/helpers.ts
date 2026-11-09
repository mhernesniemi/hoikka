import type { Page } from "@playwright/test";

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

/** The database the e2e web server runs on (playwright.config.ts). */
export const E2E_DB_PATH = "./data/e2e-test.db";
