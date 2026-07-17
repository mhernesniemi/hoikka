/**
 * Performance budget check. Runs Lighthouse (mobile, applied throttling for
 * stable observed metrics) against the given URLs and fails when a budget is
 * exceeded — performance is a feature, and features get regression tests.
 *
 *   pnpm perf https://example.com/ https://example.com/products/1/apple
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Budgets carry headroom over the targets (LCP "good" is 2500ms; we measure
// ~2400-2600ms): single throttled runs jitter ±200ms, and a budget that
// flakes gets ignored. Tighten these as the p75 improves.
const BUDGETS = {
	performanceScore: 90, // Lighthouse performance category, 0-100
	lcpMs: 3000,
	clsMax: 0.1,
	tbtMs: 300
};

const urls = process.argv.slice(2);
if (urls.length === 0) {
	console.error("usage: pnpm perf <url> [url...]");
	process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "perf-"));
let failed = false;

for (const url of urls) {
	const out = join(work, "report.json");
	execFileSync(
		"npx",
		[
			"-y",
			"lighthouse",
			url,
			"--only-categories=performance",
			"--form-factor=mobile",
			"--throttling-method=devtools",
			"--output=json",
			`--output-path=${out}`,
			"--chrome-flags=--headless=new",
			"--quiet"
		],
		{ stdio: ["ignore", "ignore", "inherit"] }
	);

	const report = JSON.parse(readFileSync(out, "utf8"));
	const score = Math.round(report.categories.performance.score * 100);
	const lcp = report.audits["largest-contentful-paint"].numericValue;
	const cls = report.audits["cumulative-layout-shift"].numericValue;
	const tbt = report.audits["total-blocking-time"].numericValue;

	const checks = [
		["performance", score, BUDGETS.performanceScore, score >= BUDGETS.performanceScore],
		["LCP", `${Math.round(lcp)}ms`, `${BUDGETS.lcpMs}ms`, lcp <= BUDGETS.lcpMs],
		["CLS", cls.toFixed(3), BUDGETS.clsMax, cls <= BUDGETS.clsMax],
		["TBT", `${Math.round(tbt)}ms`, `${BUDGETS.tbtMs}ms`, tbt <= BUDGETS.tbtMs]
	];

	console.log(`\n${url}`);
	for (const [name, actual, budget, ok] of checks) {
		console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${actual} (budget ${budget})`);
		if (!ok) failed = true;
	}
}

process.exit(failed ? 1 : 0);
