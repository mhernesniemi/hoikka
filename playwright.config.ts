import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false, // Run tests sequentially for checkout flow
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "html",
	use: {
		baseURL: process.env.BASE_URL || "http://localhost:4573",
		trace: "on-first-retry",
		screenshot: "only-on-failure"
	},
	webServer: process.env.BASE_URL
		? undefined
		: {
				// Dedicated port so a dev server on 5173 is never reused by accident
				command: "pnpm dev --port 4573 --strictPort",
				url: "http://localhost:4573",
				reuseExistingServer: false
			},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] }
		}
	]
});
