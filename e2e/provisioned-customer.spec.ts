import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";

/**
 * A customer created ahead of their login (an import, an ERP sync) sets a
 * password through "forgot password" and signs in to their own record.
 */
const DB_PATH = "./data/e2e-test.db";

test("a pre-created customer sets a password and signs in to their record", async ({ page }) => {
	const email = `provisioned-${Date.now()}@test.local`;
	const sqlite = new Database(DB_PATH);
	const now = Date.now();
	sqlite
		.prepare(
			"insert into customers (email, first_name, last_name, createdAt, updatedAt) values (?, 'Provisioned', 'Customer', ?, ?)"
		)
		.run(email, now, now);

	await page.goto("/forgot-password");
	await page.waitForLoadState("networkidle");
	await page.fill("#email", email);
	await page.click('button[type="submit"]');
	await expect(page.locator("#otp")).toBeVisible();

	const { value } = sqlite
		.prepare("select value from verification where identifier = ?")
		.get(`forget-password-otp-${email}`) as { value: string };
	await page.fill("#otp", value.split(":")[0]);
	await page.fill("#new-password", "provisioned-pass-1");
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/sign-in/);

	await page.waitForLoadState("networkidle");
	await page.fill("#email", email);
	await page.fill("#password", "provisioned-pass-1");
	await page.click('button[type="submit"]');
	await page.waitForURL((url) => url.pathname === "/");

	await page.goto("/account");
	await expect(page.locator("#firstName")).toHaveValue("Provisioned");
	const linked = sqlite
		.prepare("select count(*) as n from customers where email = ? and auth_user_id is not null")
		.get(email) as { n: number };
	expect(linked.n).toBe(1);
	const login = sqlite
		.prepare("select last_sign_in_at as at from user where email = ?")
		.get(email) as { at: number | null };
	expect(login.at).toBeGreaterThanOrEqual(now);
	sqlite.close();
});
