/**
 * verify-package-mode — the anti-drift gate proving one source serves both
 * distribution modes.
 *
 * Assembles a PACKAGE-MODE project from the current tree: the thin template
 * with @hoikka/core installed from a freshly packed tarball instead of the
 * embedded workspace. Then: install → sync-routes check → unit tests → node
 * build → boot on a real port with a fresh database (runtime migration out of
 * the installed package proves migrationsDir()) → HTTP smoke → cloudflare
 * build with a bundle assertion → eject flag-refusal checks → a real eject →
 * rebuild → re-smoke.
 *
 * Run from the repo root: node scripts/verify-package-mode.mjs
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = process.cwd();
const PORT = 18790;

const log = (message) => console.log(`\n[verify-package-mode] ${message}`);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const runQuiet = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts }).toString();

// ---- 1. Pack the tarball ---------------------------------------------------
log("packing @hoikka/core");
const packOutput = runQuiet("pnpm", ["--filter", "@hoikka/core", "pack", "--json"], { cwd: repo });
// pnpm prints one JSON object with an absolute `filename`
const tarball = JSON.parse(packOutput.slice(packOutput.indexOf("{"))).filename;
if (!existsSync(tarball)) throw new Error(`tarball not found: ${tarball}`);

// ---- 2. Assemble the package-mode project ----------------------------------
const work = mkdtempSync(path.join(tmpdir(), "hoikka-pkgmode-"));
log(`assembling package-mode project in ${work}`);

// The working tree as a user would commit it (tracked + untracked-unignored)
execSync(
	`git ls-files -co --exclude-standard | tar -cf - -T - | tar -xf - -C ${JSON.stringify(work)}`,
	{
		cwd: repo
	}
);
rmSync(path.join(work, "src/hoikka"), { recursive: true, force: true });
rmSync(path.join(work, "packages"), { recursive: true, force: true });
// Package mode has no workspace file (eject writes one); the native-build
// allowlist lives in package.json so nothing else needs it.
rmSync(path.join(work, "pnpm-workspace.yaml"), { force: true });

const pkg = JSON.parse(readFileSync(path.join(work, "package.json"), "utf8"));
pkg.dependencies["@hoikka/core"] = `file:${tarball}`;
delete pkg.scripts["verify:pack"];
delete pkg.scripts["verify:package"];
writeFileSync(path.join(work, "package.json"), JSON.stringify(pkg, null, "\t") + "\n");

log("installing");
run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: work });

// ---- 3. Static checks -------------------------------------------------------
log("sync-routes check");
run("pnpm", ["exec", "hoikka", "sync-routes"], { cwd: work });

log("unit tests (project-owned only — package tests ship no further than the repo)");
run("pnpm", ["exec", "vitest", "run", "--passWithNoTests"], { cwd: work });

// ---- 4. Node build + boot + HTTP smoke --------------------------------------
const smoke = async (phase) => {
	log(`${phase}: node build`);
	run("pnpm", ["build"], { cwd: work });

	log(`${phase}: booting on :${PORT} with a fresh database`);
	const dbPath = path.join(work, "data", `verify-${phase}.db`);
	const server = spawn("node", ["build"], {
		cwd: work,
		env: {
			...process.env,
			PORT: String(PORT),
			DATABASE_URL: dbPath,
			BETTER_AUTH_SECRET: "verify-package-mode-secret",
			ADMIN_SETUP_SECRET: "verify-package-mode-setup", // opens /admin/setup on the fresh DB
			BODY_SIZE_LIMIT: "209715200"
		},
		stdio: ["ignore", "pipe", "pipe"]
	});
	let serverOutput = "";
	server.stdout.on("data", (d) => (serverOutput += d));
	server.stderr.on("data", (d) => (serverOutput += d));

	try {
		let up = false;
		for (let i = 0; i < 60; i++) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			try {
				const res = await fetch(`http://localhost:${PORT}/`);
				if (res.status < 500) {
					up = true;
					break;
				}
			} catch {
				/* not up yet */
			}
		}
		if (!up) throw new Error(`server never came up\n${serverOutput.slice(-2000)}`);

		const checks = [
			["/", 200],
			["/products", 200], // hits the DB → proves runtime migration from the package dir
			["/admin/setup", 200], // fresh DB → login redirects here; setup itself must render
			["/admin/products", 303] // adminGuard redirect, not a 500
		];
		for (const [route, expected] of checks) {
			const res = await fetch(`http://localhost:${PORT}${route}`, { redirect: "manual" });
			if (res.status !== expected) {
				throw new Error(
					`${phase}: GET ${route} → ${res.status}, expected ${expected}\n${serverOutput.slice(-2000)}`
				);
			}
			console.log(`  GET ${route} → ${res.status} ✓`);
		}
	} finally {
		server.kill("SIGTERM");
	}
};

await smoke("package-mode");

// ---- 5. Cloudflare build + bundle assertion ---------------------------------
log("cloudflare build");
run("pnpm", ["build"], { cwd: work, env: { ...process.env, HOIKKA_TARGET: "cloudflare" } });
const worker = readFileSync(path.join(work, ".svelte-kit/cloudflare/_worker.js"), "utf8");
for (const forbidden of ["better-sqlite3", "node:fs"]) {
	if (worker.includes(forbidden)) {
		throw new Error(`cloudflare worker bundle contains ${forbidden} — stub aliases failed`);
	}
}
console.log("  worker bundle clean ✓");

// ---- 6. Eject: refusals, then the real thing --------------------------------
log("eject refusal checks");
execSync("git init -q && git add -A && git -c user.email=v@v -c user.name=v commit -qm assembly", {
	cwd: work
});
const expectFail = (args, description) => {
	try {
		runQuiet("pnpm", ["exec", "hoikka", "eject", ...args], { cwd: work });
		throw new Error(`eject ${args.join(" ")} should have refused (${description})`);
	} catch (error) {
		if (String(error.message).includes("should have refused")) throw error;
		console.log(`  refused ${args.join(" ") || "(dirty)"} ✓ (${description})`);
	}
};
expectFail(["--undo"], "one-way");
expectFail(["--force"], "one-way");
expectFail(["--nonsense"], "unknown flag");
writeFileSync(path.join(work, "DIRTY.tmp"), "x");
expectFail([], "dirty worktree");
rmSync(path.join(work, "DIRTY.tmp"));
if (existsSync(path.join(work, "src/hoikka/server"))) {
	throw new Error("a refused eject still mutated src/hoikka");
}

log("real eject");
run("pnpm", ["exec", "hoikka", "eject", "--allow-dirty"], { cwd: work });
for (const proof of [
	"src/hoikka/server/db/schema.ts",
	"src/hoikka/package.json",
	"pnpm-workspace.yaml"
]) {
	if (!existsSync(path.join(work, proof))) throw new Error(`post-eject missing: ${proof}`);
}
const ejectedPkg = JSON.parse(readFileSync(path.join(work, "package.json"), "utf8"));
if (ejectedPkg.dependencies["@hoikka/core"] !== "workspace:*") {
	throw new Error("post-eject dependency is not workspace:*");
}

log("post-eject rebuild + re-smoke");
await smoke("post-eject");

log(`OK — cleaning up ${work}`);
rmSync(work, { recursive: true, force: true });
rmSync(tarball, { force: true });
console.log("\nverify-package-mode: ok");
