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

// Warm the edge caches before measuring. A deploy invalidates every cached
// page (the build version is part of the cache key), so a run triggered right
// after one would otherwise measure cold SSR instead of steady state. Two hits:
// the first populates the caches, the second confirms they serve.
for (const url of urls) {
	for (let i = 0; i < 2; i++) {
		try {
			await fetch(url, { headers: { "user-agent": "hoikka-perf-warmup" } });
		} catch {
			// unreachable URLs fail loudly in the Lighthouse run below
		}
	}
}

const work = mkdtempSync(join(tmpdir(), "perf-"));

function measure(url) {
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

	return [
		["performance", score, BUDGETS.performanceScore, score >= BUDGETS.performanceScore],
		["LCP", `${Math.round(lcp)}ms`, `${BUDGETS.lcpMs}ms`, lcp <= BUDGETS.lcpMs],
		["CLS", cls.toFixed(3), BUDGETS.clsMax, cls <= BUDGETS.clsMax],
		["TBT", `${Math.round(tbt)}ms`, `${BUDGETS.tbtMs}ms`, tbt <= BUDGETS.tbtMs]
	];
}

// Discarded bootstrap run: the first Lighthouse invocation on a fresh runner
// pays the npx download and Chrome's first launch, which inflated whatever URL
// was measured first (observed 482-1422ms TBT for the same page that measures
// ~190ms once the runner is warm).
measure(urls[0]);

let failed = false;

for (const url of urls) {
	let checks = measure(url);
	// One retry on a failed budget, same policy as Playwright's CI retries:
	// a single throttled run on a shared runner jitters; a real regression
	// fails twice.
	if (checks.some(([, , , ok]) => !ok)) {
		checks = measure(url);
	}

	console.log(`\n${url}`);
	for (const [name, actual, budget, ok] of checks) {
		console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${actual} (budget ${budget})`);
		if (!ok) failed = true;
	}
}

process.exit(failed ? 1 : 0);
