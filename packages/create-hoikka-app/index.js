#!/usr/bin/env node

import * as p from "@clack/prompts";
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Async spawn wrapper so long-running commands don't block clack spinners
const runAsync = (cmd, cwd) =>
	new Promise((resolve, reject) => {
		const child = spawn(cmd, { cwd, shell: true });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => (stdout += d.toString()));
		child.stderr.on("data", (d) => (stderr += d.toString()));
		child.on("close", (code) => {
			if (code === 0) resolve(stdout);
			else {
				const err = new Error(`Command failed: ${cmd}`);
				err.stderr = stderr;
				err.stdout = stdout;
				reject(err);
			}
		});
	});

const pm = {
	exec: "pnpm exec",
	run: "pnpm",
	install: "pnpm install"
};

// Template source — overridable for forks and local testing
const REPO = process.env.HOIKKA_TEMPLATE ?? "https://github.com/mhernesniemi/hoikka.git";

// Minimal flag parsing so the CLI is scriptable: --mode=package|embedded,
// --target=local|cloudflare, --seed / --no-seed, --yes (answer "no" to all
// optional extras)
const flags = {};
for (const arg of process.argv.slice(3)) {
	if (arg === "--yes") flags.yes = true;
	else if (arg === "--seed") flags.seed = true;
	else if (arg === "--no-seed") flags.seed = false;
	else if (arg.startsWith("--target=")) flags.target = arg.slice("--target=".length);
	else if (arg.startsWith("--mode=")) flags.mode = arg.slice("--mode=".length);
}
if (flags.mode !== undefined && !["package", "embedded"].includes(flags.mode)) {
	console.error('--mode must be "package" or "embedded"');
	process.exit(1);
}

// Files from the hoikka repo that shouldn't leak into scaffolded stores.
const CLEANUP = [
	"CLAUDE.md",
	"ARCHITECTURE.md",
	"claude",
	".claude/settings.local.json",
	"packages",
	".DS_Store"
];

// Resolve the latest release tag (v-prefixed semver) so scaffolds pin to a
// deliberate release instead of whatever HEAD happens to be. Returns null when
// the repo has no tags (falls back to the default branch).
const resolveLatestTag = () => {
	try {
		const output = execSync(`git ls-remote --tags --sort=-v:refname ${REPO} "v*"`, {
			stdio: "pipe"
		}).toString();
		for (const line of output.split("\n")) {
			const match = line.match(/refs\/tags\/(v[0-9][^^\s]*)$/);
			if (match) return match[1];
		}
	} catch {
		// Network/git hiccup — fall back to default branch
	}
	return null;
};

// Replace the template's resource names ("hoikka", "hoikka-db", "hoikka-assets")
// with project-specific ones inside a config file.
const renameResources = (filePath, projectName) => {
	let content = readFileSync(filePath, "utf-8");
	content = content
		.replaceAll("hoikka-db", `${projectName}-db`)
		.replaceAll("hoikka-assets", `${projectName}-assets`)
		.replace(/"name":\s*"hoikka"/, `"name": "${projectName}"`);
	writeFileSync(filePath, content);
};

async function main() {
	p.intro("🛍️  Create Hoikka Store");

	// 1. Project name
	const projectName =
		process.argv[2] ||
		(await p.text({
			message: "Project name",
			placeholder: "my-store",
			validate: (value) => {
				if (!value) return "Project name is required";
				if (!/^[a-z0-9][a-z0-9._-]*$/.test(value))
					return "Use lowercase letters, numbers, dots, hyphens, and underscores";
			}
		}));

	if (p.isCancel(projectName)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}

	const projectDir = path.resolve(process.cwd(), projectName);
	if (existsSync(projectDir)) {
		p.cancel(`Directory "${projectName}" already exists.`);
		process.exit(1);
	}

	// 2. Distribution mode — same source either way; package mode swaps the
	// embedded core for the published @hoikka/core at the template's version.
	const mode =
		flags.mode ??
		(await p.select({
			message: "How do you want the core?",
			options: [
				{
					label: "Package",
					value: "package",
					hint: "@hoikka/core dependency — upgrade with a version bump"
				},
				{
					label: "Embedded",
					value: "embedded",
					hint: "full source in src/hoikka, yours to modify"
				}
			]
		}));

	if (p.isCancel(mode)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}

	// 3. Deploy target — this only sets HOIKKA_TARGET; the codebase is
	// identical for both and can be switched later by editing .env.
	const target =
		flags.target ??
		(await p.select({
			message: "Where will you run the store?",
			options: [
				{ label: "Local / Node.js", value: "local", hint: "SQLite file + local uploads" },
				{ label: "Cloudflare", value: "cloudflare", hint: "Workers + D1 + R2" }
			]
		}));

	if (p.isCancel(target)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}

	// 4. Demo content (local only — Cloudflare needs a D1 database first)
	let seedDemo = false;
	if (target === "local") {
		const answer =
			flags.seed ??
			(await p.confirm({
				message: "Seed demo products?",
				initialValue: true
			}));
		if (p.isCancel(answer)) {
			p.cancel("Setup cancelled.");
			process.exit(0);
		}
		seedDemo = answer;
	}

	// --- Scaffold via git clone ---

	const s = p.spinner();
	s.start("Fetching the latest Hoikka release");
	const tag = resolveLatestTag();
	let templateCommit = null;
	try {
		const branchArg = tag ? `--branch ${tag}` : "";
		execSync(`git clone --depth 1 ${branchArg} ${REPO} ${JSON.stringify(projectDir)}`, {
			stdio: "pipe"
		});
		templateCommit = execSync("git rev-parse HEAD", { cwd: projectDir, stdio: "pipe" })
			.toString()
			.trim();
		rmSync(path.join(projectDir, ".git"), { recursive: true, force: true });
		s.stop(`Template ready (${tag ?? "main"})`);
	} catch (err) {
		s.stop("Clone failed");
		if (err.stderr) console.error(err.stderr.toString().slice(-500));
		p.cancel("Could not clone the Hoikka template.");
		process.exit(1);
	}

	for (const entry of CLEANUP) {
		rmSync(path.join(projectDir, entry), { recursive: true, force: true });
	}

	// --- Distribution mode ---
	// Both modes clone the same template at the same tag; package mode then
	// deletes the embedded core and depends on the published @hoikka/core at
	// exactly that version, so both modes run identical source.

	const corePkgPath = path.join(projectDir, "src/hoikka/package.json");
	const coreVersion = existsSync(corePkgPath)
		? JSON.parse(readFileSync(corePkgPath, "utf-8")).version
		: null;

	if (mode === "package") {
		const abort = (message) => {
			rmSync(projectDir, { recursive: true, force: true });
			p.cancel(message);
			process.exit(1);
		};
		if (!coreVersion) {
			abort(
				"This template release predates package mode — choose Embedded, or wait for the next release."
			);
		}
		// The npm artifact publishes after the template tag (CI runs the release
		// gate first) — a scaffold in that window would fail install on a missing
		// version. Fail early with a clear message instead. HOIKKA_CORE_DEP
		// overrides the dependency spec for pre-publish testing (e.g. file:….tgz).
		const coreDep = process.env.HOIKKA_CORE_DEP ?? `^${coreVersion}`;
		if (!process.env.HOIKKA_CORE_DEP) {
			try {
				execSync(`npm view @hoikka/core@${coreVersion} version`, { stdio: "pipe" });
			} catch {
				abort(
					`@hoikka/core@${coreVersion} is not on npm yet — if this release was just tagged, publishing may still be running. Retry in a few minutes, or choose Embedded mode.`
				);
			}
		}

		rmSync(path.join(projectDir, "src/hoikka"), { recursive: true, force: true });
		// Not deleted but emptied: without its own workspace file the project
		// would be absorbed by any enclosing pnpm workspace (pnpm walks up),
		// installing its dependencies into the wrong node_modules entirely.
		writeFileSync(
			path.join(projectDir, "pnpm-workspace.yaml"),
			[
				"# Marks this project as its own pnpm workspace root so an enclosing pnpm",
				"# workspace cannot absorb it (pnpm walks up looking for this file otherwise",
				"# and would install everything into the outer workspace). `hoikka eject`",
				"# replaces the empty list with src/hoikka.",
				"packages: []",
				""
			].join("\n")
		);
		// Embedded-repo distribution tooling, and core-migration authoring:
		// package-mode projects can't author core DB migrations (eject to take
		// schema ownership), so drizzle-kit goes too.
		rmSync(path.join(projectDir, "scripts/verify-pack.mjs"), { force: true });
		rmSync(path.join(projectDir, "scripts/verify-package-mode.mjs"), { force: true });
		rmSync(path.join(projectDir, "drizzle.config.ts"), { force: true });

		const pkgPath = path.join(projectDir, "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		pkg.dependencies["@hoikka/core"] = coreDep;
		delete pkg.scripts["verify:pack"];
		delete pkg.scripts["verify:package"];
		delete pkg.scripts["db:generate"];
		delete pkg.scripts["db:studio"];
		delete pkg.devDependencies["drizzle-kit"];
		// Unit tests live in the core package — let vitest pass until the
		// project grows tests of its own.
		pkg.scripts.test = "vitest --run --passWithNoTests";
		pkg.scripts["test:unit"] = "vitest --passWithNoTests";
		writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
	}

	// --- Configuration ---

	s.start("Applying configuration");

	const authSecret = randomBytes(32).toString("base64url");
	const envLines = [
		`# Deployment target: "node" or "cloudflare" — flip this to switch`,
		`HOIKKA_TARGET=${target === "cloudflare" ? "cloudflare" : "node"}`,
		"",
		"# Local SQLite database file (node target only). Defaults to ./data/hoikka.db",
		`# DATABASE_URL="./data/hoikka.db"`,
		"",
		"# Better Auth",
		`BETTER_AUTH_SECRET="${authSecret}"`,
		"# Optional — auth derives the URL from the request. Set only to override.",
		`# BETTER_AUTH_URL="http://localhost:5173"`,
		"",
		"# Optional integrations — the store runs fine without them",
		"# GOOGLE_CLIENT_ID=",
		"# GOOGLE_CLIENT_SECRET=",
		"# RESEND_API_KEY=",
		"# RESEND_FROM_EMAIL=",
		"# STRIPE_SECRET_KEY=",
		"# PUBLIC_STRIPE_PUBLISHABLE_KEY="
	];
	writeFileSync(path.join(projectDir, ".env"), envLines.join("\n") + "\n");

	renameResources(path.join(projectDir, "wrangler.jsonc"), projectName);
	renameResources(path.join(projectDir, "package.json"), projectName);

	// Provenance stamp: which template release this store came from
	const versionStamp = {
		template: REPO,
		ref: tag ?? "main",
		commit: templateCommit,
		mode,
		coreVersion,
		target,
		scaffoldedAt: new Date().toISOString(),
		createHoikkaApp: "0.1.0"
	};
	writeFileSync(
		path.join(projectDir, ".hoikka-version"),
		`${JSON.stringify(versionStamp, null, 2)}\n`
	);

	s.stop("Configuration applied");

	// --- Install dependencies ---

	s.start("Installing dependencies");
	try {
		await runAsync(pm.install, projectDir);
		s.stop("Dependencies installed");
	} catch {
		s.stop(`${pm.install} failed — run it manually`);
	}

	// --- Seed demo content (local target) ---
	// `pnpm seed` migrates the database on first use, so this also creates it.

	if (seedDemo) {
		s.start("Seeding demo products");
		try {
			execSync(`${pm.run} seed`, { cwd: projectDir, stdio: "pipe" });
			s.stop("Demo products seeded");
		} catch (err) {
			s.stop("Seeding failed — run `pnpm seed` manually");
			if (err.stderr) console.error(err.stderr.toString().slice(-500));
		}
	}

	// --- Initialize git repository ---

	let gitInitialized = false;
	try {
		execSync(
			"git init -q && git add . && git commit -q -m 'Initial commit from create-hoikka-app'",
			{
				cwd: projectDir,
				stdio: "pipe"
			}
		);
		gitInitialized = true;
	} catch {
		// git not available — silently skip
	}

	// --- Optional: create GitHub repository ---

	if (gitInitialized && !flags.yes) {
		let ghAvailable = false;
		try {
			execSync("gh --version", { stdio: "pipe" });
			execSync("gh auth status", { stdio: "pipe" });
			ghAvailable = true;
		} catch {
			// gh not installed or not authenticated — skip the prompt
		}

		if (ghAvailable) {
			const createRepo = await p.confirm({
				message: "Create a GitHub repository for this project?",
				initialValue: false
			});
			if (!p.isCancel(createRepo) && createRepo) {
				let ghUser = "";
				try {
					ghUser = execSync("gh api user --jq .login", { stdio: "pipe" })
						.toString()
						.trim();
				} catch {
					// ignore
				}

				let repoName = null;
				while (true) {
					const input = await p.text({
						message: "Repository name",
						initialValue: projectName,
						validate: (value) => {
							if (!value) return "Repository name is required";
							if (!/^[a-zA-Z0-9._-]+$/.test(value))
								return "Only letters, numbers, dots, hyphens, and underscores";
						}
					});
					if (p.isCancel(input)) break;

					if (ghUser) {
						try {
							execSync(`gh repo view ${ghUser}/${input}`, { stdio: "pipe" });
							p.note(
								`A repository named "${input}" already exists. Pick a different name.`,
								"Name taken"
							);
							continue;
						} catch {
							// Repo doesn't exist — name is free
						}
					}
					repoName = input;
					break;
				}

				if (repoName) {
					const visibility = await p.select({
						message: "Repository visibility",
						options: [
							{ label: "Private", value: "--private" },
							{ label: "Public", value: "--public" }
						]
					});
					if (!p.isCancel(visibility)) {
						s.start("Creating GitHub repository");
						try {
							execSync(`gh repo create ${repoName} ${visibility}`, {
								cwd: projectDir,
								stdio: "pipe"
							});
							// SSH remote: works with existing keys, avoids HTTPS credential prompts
							execSync(
								`git remote add origin git@github.com:${ghUser}/${repoName}.git`,
								{
									cwd: projectDir,
									stdio: "pipe"
								}
							);
							execSync("git branch -M main && git push -u origin main", {
								cwd: projectDir,
								stdio: "pipe"
							});
							s.stop("GitHub repository created and pushed");
						} catch (err) {
							s.stop("GitHub repository creation failed");
							if (err.stderr) console.error(err.stderr.toString().slice(-500));
						}
					}
				}
			}
		}
	}

	// --- Cloudflare resource setup ---

	const cf = {
		d1Created: false,
		r2Created: false,
		migrationsApplied: false,
		localMigrationsApplied: false,
		deployed: false,
		url: null
	};

	if (target === "cloudflare") {
		const setupNow = flags.yes
			? false
			: await p.confirm({
					message: "Set up Cloudflare resources now? (creates D1 database and R2 bucket)",
					initialValue: true
				});

		if (!p.isCancel(setupNow) && setupNow) {
			let authenticated = false;
			try {
				execSync(`${pm.exec} wrangler whoami`, { cwd: projectDir, stdio: "pipe" });
				authenticated = true;
			} catch {
				p.note("You need to log in to Cloudflare first.", "Wrangler login required");
				const doLogin = await p.confirm({
					message: "Open browser to log in?",
					initialValue: true
				});
				if (!p.isCancel(doLogin) && doLogin) {
					try {
						execSync(`${pm.exec} wrangler login`, {
							cwd: projectDir,
							stdio: "inherit"
						});
						authenticated = true;
					} catch {
						s.stop("Login failed");
					}
				}
			}

			if (authenticated) {
				// Create D1 database and write its real id into wrangler.jsonc
				let databaseId = null;
				s.start("Creating D1 database");
				try {
					const output = execSync(`${pm.exec} wrangler d1 create ${projectName}-db`, {
						cwd: projectDir,
						stdio: "pipe"
					}).toString();
					const match = output.match(
						/"database_id":\s*"([^"]+)"|database_id\s*=\s*"([^"]+)"/
					);
					if (match) {
						databaseId = match[1] ?? match[2];
						cf.d1Created = true;
						s.stop("D1 database created");
					} else {
						s.stop(
							"D1 database created, but its id could not be read — copy the database_id into wrangler.jsonc manually"
						);
					}
				} catch (err) {
					// Already exists — look it up
					try {
						const listOutput = execSync(`${pm.exec} wrangler d1 list`, {
							cwd: projectDir,
							stdio: "pipe"
						}).toString();
						const dbLine = listOutput
							.split("\n")
							.find((l) => l.includes(`${projectName}-db`));
						const idMatch = dbLine?.match(
							/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
						);
						if (idMatch) {
							databaseId = idMatch[0];
							cf.d1Created = true;
							s.stop("D1 database already exists — using existing");
						} else {
							s.stop("D1 setup failed");
							if (err.stderr) console.error(err.stderr.toString().slice(-500));
						}
					} catch {
						s.stop("D1 setup failed");
					}
				}

				if (databaseId) {
					const wranglerPath = path.join(projectDir, "wrangler.jsonc");
					const content = readFileSync(wranglerPath, "utf-8").replace(
						/"database_id":\s*"[^"]*"/,
						`"database_id": "${databaseId}"`
					);
					writeFileSync(wranglerPath, content);
				}

				// Create R2 bucket
				s.start("Creating R2 bucket");
				try {
					execSync(`${pm.exec} wrangler r2 bucket create ${projectName}-assets`, {
						cwd: projectDir,
						stdio: "pipe"
					});
					cf.r2Created = true;
					s.stop("R2 bucket created");
				} catch {
					cf.r2Created = true;
					s.stop("R2 bucket already exists");
				}

				// Create the KV namespace for the storefront edge cache and write
				// its real id into wrangler.jsonc (missing binding = caching off)
				let kvId = null;
				s.start("Creating KV namespace for the edge cache");
				try {
					const kvOutput = execSync(
						`${pm.exec} wrangler kv namespace create ${projectName}-cache`,
						{ cwd: projectDir, stdio: "pipe" }
					).toString();
					const kvMatch = kvOutput.match(/"id":\s*"([0-9a-f]{32})"/);
					if (kvMatch) {
						kvId = kvMatch[1];
						s.stop("KV namespace created");
					} else {
						s.stop(
							"KV namespace created, but its id could not be read — copy it into wrangler.jsonc manually"
						);
					}
				} catch {
					// Already exists — look it up
					try {
						const kvList = execSync(`${pm.exec} wrangler kv namespace list`, {
							cwd: projectDir,
							stdio: "pipe"
						}).toString();
						const entry = JSON.parse(kvList).find((n) =>
							n.title.includes(`${projectName}-cache`)
						);
						if (entry) {
							kvId = entry.id;
							s.stop("KV namespace already exists — using existing");
						} else {
							s.stop("KV namespace setup failed — edge caching stays disabled");
						}
					} catch {
						s.stop("KV namespace setup failed — edge caching stays disabled");
					}
				}
				if (kvId) {
					const wranglerPath = path.join(projectDir, "wrangler.jsonc");
					const content = readFileSync(wranglerPath, "utf-8").replace(
						/"id":\s*"0{32}"/,
						`"id": "${kvId}"`
					);
					writeFileSync(wranglerPath, content);
				}

				// Apply migrations to the remote D1 (migrations ship with the template)
				if (databaseId) {
					s.start("Applying migrations to remote D1");
					try {
						execSync(
							`${pm.exec} wrangler d1 migrations apply ${projectName}-db --remote`,
							{
								cwd: projectDir,
								stdio: "pipe",
								input: "y\n"
							}
						);
						cf.migrationsApplied = true;
						s.stop("Migrations applied");
					} catch (err) {
						s.stop("Migration apply failed — run `pnpm db:migrate:cf` manually");
						if (err.stderr) console.error(err.stderr.toString().slice(-500));
					}
				}

				// `pnpm dev` talks to a local D1 (miniflare), not the remote one, and
				// nothing migrates it on boot the way the node target does — so
				// without this the dev server 500s on its first query.
				s.start("Applying migrations to local D1");
				try {
					execSync(`${pm.exec} wrangler d1 migrations apply ${projectName}-db --local`, {
						cwd: projectDir,
						stdio: "pipe",
						input: "y\n"
					});
					cf.localMigrationsApplied = true;
					s.stop("Local D1 ready for `pnpm dev`");
				} catch (err) {
					s.stop(
						"Local migration apply failed — run `pnpm db:migrate:cf:local` manually"
					);
					if (err.stderr) console.error(err.stderr.toString().slice(-500));
				}

				// Set the auth secret as a Worker secret
				s.start("Setting BETTER_AUTH_SECRET");
				try {
					execSync(`${pm.exec} wrangler secret put BETTER_AUTH_SECRET`, {
						cwd: projectDir,
						stdio: "pipe",
						input: `${authSecret}\n`
					});
					s.stop("Auth secret set");
				} catch {
					s.stop(
						"Setting secret failed — run `pnpm exec wrangler secret put BETTER_AUTH_SECRET`"
					);
				}

				// Optional deploy
				const deployNow = await p.confirm({
					message: "Build and deploy to Cloudflare now?",
					initialValue: true
				});
				if (!p.isCancel(deployNow) && deployNow) {
					s.start("Building and deploying (takes a minute)");
					try {
						const output = await runAsync(`${pm.run} deploy:cf`, projectDir);
						const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
						cf.deployed = true;
						cf.url = urlMatch?.[0] ?? null;
						s.stop("Deployed");
					} catch (err) {
						s.stop("Deploy failed — run `pnpm deploy:cf` manually");
						if (err.stderr) console.error(err.stderr.toString().slice(-800));
					}
				}
			}
		}
	}

	// --- Done ---

	if (target === "cloudflare") {
		const lines = [];
		if (cf.deployed && cf.url) {
			lines.push(`Your store is live: ${cf.url}`, "");
			lines.push(`Create the admin account: ${cf.url}/admin`);
		} else {
			lines.push("Remaining setup:");
			if (!cf.d1Created) lines.push(`  • ${pm.exec} wrangler d1 create ${projectName}-db`);
			if (!cf.r2Created)
				lines.push(`  • ${pm.exec} wrangler r2 bucket create ${projectName}-assets`);
			if (!cf.migrationsApplied) lines.push(`  • ${pm.run} db:migrate:cf`);
			lines.push(`  • ${pm.run} deploy:cf`);
		}
		lines.push("", `Local development: cd ${projectName} && ${pm.run} dev:cf`);
		if (!cf.localMigrationsApplied)
			lines.push(`  (run ${pm.run} db:migrate:cf:local first — dev uses its own local D1)`);
		p.note(lines.join("\n"), "Next steps");
		p.outro("Happy selling! 🛍️");
	} else {
		p.note(
			[
				`cd ${projectName}`,
				`${pm.run} dev`,
				"",
				"Then create your admin account at http://localhost:5173/admin"
			].join("\n"),
			"Next steps"
		);

		const startDev = flags.yes
			? false
			: await p.confirm({
					message: "Start the dev server now?",
					initialValue: true
				});
		if (!p.isCancel(startDev) && startDev) {
			p.outro("Starting dev server — Ctrl+C to stop. Happy selling! 🛍️");
			spawn(`${pm.run} dev`, { cwd: projectDir, shell: true, stdio: "inherit" });
		} else {
			p.outro("Happy selling! 🛍️");
		}
	}
}

main().catch((err) => {
	p.cancel(`Unexpected error: ${err?.message ?? err}`);
	process.exit(1);
});
