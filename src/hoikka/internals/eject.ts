/**
 * `hoikka eject` — convert a package-mode project to embedded mode by copying
 * the installed @hoikka/core source into src/hoikka/ and linking it as a pnpm
 * workspace package. Import specifiers are identical in both modes, so no code
 * changes — only where the package resolves from.
 *
 * Ejecting is one-way: from here on you own the core source and upgrades
 * arrive by merging from the template instead of bumping a dependency. To try
 * embedded mode without committing, run eject on a branch. For a single small
 * tweak in package mode, prefer `pnpm patch @hoikka/core` over ejecting.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: hoikka eject [--allow-dirty]

Copies the installed @hoikka/core source into src/hoikka/ and switches the
dependency to a pnpm workspace link. One-way — there is no undo beyond git.`;

let allowDirty = false;
// Strict argv handling: this command is irreversible, so an unrecognized flag
// must never fall through into eject.
for (const arg of process.argv.slice(2)) {
	if (arg === "--allow-dirty") {
		allowDirty = true;
	} else if (arg === "--help" || arg === "-h") {
		console.log(USAGE);
		process.exit(0);
	} else if (arg === "--undo" || arg === "--force") {
		console.error(
			`[hoikka:eject] ${arg} is not a thing — eject is one-way. Re-scaffold in package mode to go back.`
		);
		process.exit(1);
	} else {
		console.error(`[hoikka:eject] Unknown option: ${arg}\n\n${USAGE}`);
		process.exit(1);
	}
}

const cwd = process.cwd();
// This file lives inside the installed package, so its own location IS the
// source to eject (realpath resolves pnpm's symlink into the store).
const packageRoot = path.dirname(realpathSync(path.dirname(fileURLToPath(import.meta.url))));

// ---- Preconditions (all checked before any mutation) ----------------------

const rootPkgPath = path.join(cwd, "package.json");
if (!existsSync(rootPkgPath)) {
	console.error("[hoikka:eject] No package.json here — run from the project root.");
	process.exit(1);
}
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const depSpec: string | undefined = rootPkg.dependencies?.["@hoikka/core"];
if (!depSpec) {
	console.error("[hoikka:eject] This project has no @hoikka/core dependency.");
	process.exit(1);
}
if (depSpec.startsWith("workspace:")) {
	console.error("[hoikka:eject] Already embedded — @hoikka/core is a workspace link.");
	process.exit(1);
}

const corePath = path.join(cwd, "src", "hoikka");
if (existsSync(path.join(corePath, "server"))) {
	console.error(
		"[hoikka:eject] src/hoikka/server already exists — this project looks embedded already."
	);
	process.exit(1);
}

if (!allowDirty) {
	try {
		const status = execFileSync("git", ["status", "--porcelain"], { cwd }).toString();
		if (status.trim() !== "") {
			console.error(
				"[hoikka:eject] Working tree is not clean. Commit or stash first (or pass --allow-dirty)."
			);
			process.exit(1);
		}
	} catch {
		console.log("[hoikka:eject] Not a git repo — nothing to protect.");
	}
}

// Package-mode scaffolds carry a workspace file with an empty packages list —
// a marker that keeps an enclosing pnpm workspace from absorbing the project.
// That file is ours to rewrite. A workspace file with real entries is the
// user's: never overwrite it, and only proceed when src/hoikka is listed.
const workspacePath = path.join(cwd, "pnpm-workspace.yaml");
const hasWorkspaceFile = existsSync(workspacePath);
const workspaceContent = hasWorkspaceFile ? readFileSync(workspacePath, "utf8") : "";
const listsCore = /(^|\s)-\s*["']?src\/hoikka["']?\s*$/m.test(workspaceContent);
const emptyMarker =
	hasWorkspaceFile &&
	/^\s*packages\s*:\s*\[\s*\]\s*$/m.test(workspaceContent.replace(/#[^\n]*/g, ""));
if (hasWorkspaceFile && !listsCore && !emptyMarker) {
	console.error(
		'[hoikka:eject] pnpm-workspace.yaml exists but does not list src/hoikka. Add `- "src/hoikka"` under packages: and rerun.'
	);
	process.exit(1);
}

// ---- Eject ----------------------------------------------------------------

// The package's own "files" whitelist is the single source of truth for what
// is managed. Copy exactly those entries (plus package.json itself).
const corePkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const entries: string[] = (corePkg.files ?? []).filter((entry: string) => !entry.startsWith("!"));

console.log(`[hoikka:eject] Copying @hoikka/core ${corePkg.version} into src/hoikka/`);
for (const entry of entries) {
	const source = path.join(packageRoot, entry);
	if (!existsSync(source)) continue;
	cpSync(source, path.join(corePath, entry), {
		recursive: true,
		// Judge only the path below the package root — the installed package's
		// own absolute path contains node_modules segments (pnpm store).
		filter: (src) => !path.relative(packageRoot, src).split(path.sep).includes("node_modules")
	});
}
cpSync(path.join(packageRoot, "package.json"), path.join(corePath, "package.json"));

if (!hasWorkspaceFile || emptyMarker) {
	writeFileSync(
		workspacePath,
		'# Marks this project as its own pnpm workspace root so an enclosing pnpm\n# workspace cannot absorb it.\npackages:\n    - "src/hoikka"\n'
	);
}
rootPkg.dependencies["@hoikka/core"] = "workspace:*";
writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, "\t")}\n`);

// Provenance stamp
const stampPath = path.join(cwd, ".hoikka-version");
try {
	const stamp = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, "utf8")) : {};
	stamp.mode = "embedded";
	stamp.ejectedAt = new Date().toISOString();
	writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
} catch {
	// A malformed stamp never blocks an eject
}

console.log("[hoikka:eject] Installing (relinks @hoikka/core to the workspace)");
try {
	// --no-frozen-lockfile: eject just rewrote the dep spec, so the lockfile is
	// always stale here
	execFileSync("pnpm", ["install", "--no-frozen-lockfile"], { cwd, stdio: "inherit" });
} catch {
	console.error(
		"[hoikka:eject] Files are ejected and package.json is updated, but pnpm install failed. Fix the install error and run `pnpm install` to finish — no other step is pending."
	);
	process.exit(1);
}

console.log("[hoikka:eject] Done. The core now lives in src/hoikka/ and is yours to modify.");
