/**
 * verify-pack — assert the @hoikka/core npm tarball contains exactly the
 * managed surface and nothing project-owned. The package.json "files"
 * whitelist is the single source of truth for the boundary; this script is
 * the gate that keeps it honest.
 *
 * Run from the repo root: node scripts/verify-pack.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PKG_DIR = "src/hoikka";
const pkg = JSON.parse(readFileSync(`${PKG_DIR}/package.json`, "utf8"));

const allowedTop = new Set([
	...pkg.files.filter((entry) => !entry.startsWith("!")).map((entry) => entry.split("/")[0]),
	"package.json",
	"README.md",
	"LICENSE"
]);

// Anything project-owned or repo-only that must never ship.
const FORBIDDEN =
	/hoikka\.config|\.test\.ts$|__snapshots__|\.env|(^|\/)data\/|\+page|\+layout|\+server|\.hoikka-version/;

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
	cwd: PKG_DIR,
	stdio: ["ignore", "pipe", "pipe"]
}).toString();
const [{ files }] = JSON.parse(output);

const problems = [];
for (const { path } of files) {
	const top = path.split("/")[0];
	if (!allowedTop.has(top)) problems.push(`unexpected top-level entry: ${path}`);
	if (FORBIDDEN.test(path)) problems.push(`forbidden file in tarball: ${path}`);
}

// Required entry points — a publish missing one of these is broken.
const required = [
	"package.json",
	"vite.mjs",
	"internals/cli.mjs",
	"internals/eject.ts",
	"server/db/schema.ts",
	"config/index.ts",
	"routes/hooks.ts",
	"drizzle/meta/_journal.json"
];
const shipped = new Set(files.map((file) => file.path));
for (const entry of required) {
	if (!shipped.has(entry)) problems.push(`required entry missing from tarball: ${entry}`);
}

if (problems.length > 0) {
	console.error(`verify-pack: ${problems.length} problem(s)`);
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}
console.log(`verify-pack: ok (${files.length} files)`);
