import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

test("admin runs a scheduled task by hand", async ({ page }) => {
	await signInAsAdmin(page);
	await page.goto("/admin/tasks");
	await page.waitForLoadState("networkidle");

	const housekeeping = page.locator("div.rounded-lg", { hasText: "Hourly" }).first();
	await housekeeping.getByRole("button", { name: "Run now" }).click();

	await expect(page.getByText("Housekeeping finished")).toBeVisible();
	const run = page.locator("tbody tr", { hasText: "Manual" }).first();
	await expect(run).toContainText("Housekeeping");
	await expect(run).toContainText("succeeded");
});
