/**
 * `hoikka sync-routes [--check|--write]` — keep the app's route shims aligned
 * with the package's route tree.
 *
 * The package mirrors SvelteKit's route layout under routes/ with plain names
 * (page.server.ts / Page.svelte / layout.server.ts / Layout.svelte /
 * Error.svelte / server.ts); every one of those maps to a thin shim in the
 * app's src/routes that re-exports it. Shims are project-owned — they are the
 * documented override point — so this never overwrites a file that doesn't
 * carry the shim marker. `--check` (default) reports drift and exits 1;
 * `--write` creates missing shims.
 */
import {
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
	writeFileSync,
	mkdirSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = realpathSync(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PKG_ROUTES = path.join(packageDir, "routes");
const APP_ROUTES = path.join(process.cwd(), "src", "routes");

const MARKER = "Hoikka route shim";
/** Routes that break out of their layout group keep SvelteKit's @ suffix. */
const SPECIAL_PAGE_NAME: Record<string, string> = { "admin/setup": "+page@.svelte" };
const SPECIAL_LAYOUT_NAME: Record<string, string> = { "admin/login": "+layout@.svelte" };
/** Package route files that intentionally have no component body. */
const EMPTY_PAGES = new Set(["admin"]);

const SERVER_EXPORTS = [
	"load",
	"actions",
	"prerender",
	"csr",
	"ssr",
	"trailingSlash",
	"config",
	"GET",
	"POST",
	"PUT",
	"DELETE",
	"PATCH",
	"OPTIONS",
	"HEAD",
	"fallback"
];

function exportedNames(file: string): string[] {
	const body = readFileSync(file, "utf8");
	return SERVER_EXPORTS.filter((name) =>
		new RegExp(`export (?:const|async function|function) ${name}\\b`).test(body)
	);
}

function declaredProps(file: string): Set<string> {
	const body = readFileSync(file, "utf8");
	const match = body.match(/let \{([^}]*)\}\s*(?::[^=]+)?= \$props\(\)/);
	if (!match) return new Set();
	return new Set(
		match[1]
			.split(",")
			.map((part) => part.trim().split(":")[0].split("=")[0].trim())
			.filter(Boolean)
	);
}

function componentShim(spec: string, componentName: string, props: string[]): string {
	const lines = [
		"<!-- Hoikka route shim - regenerate with `hoikka sync-routes --write`. -->",
		'<script lang="ts">',
		`  import ${componentName} from "${spec}";`
	];
	if (props.length > 0) lines.push(`  let { ${props.join(", ")} } = $props();`);
	lines.push("</script>", "");
	const passed = props.map((p) => `{${p}}`).join(" ");
	lines.push(`<${componentName}${passed ? ` ${passed}` : ""} />`, "");
	return lines.join("\n");
}

interface Expected {
	appFile: string;
	content: string;
}

function expectedShims(): Expected[] {
	const out: Expected[] = [];

	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			const rel = path.relative(PKG_ROUTES, dir).split(path.sep).join("/");
			const spec = rel === "" ? "@hoikka/core/routes" : `@hoikka/core/routes/${rel}`;
			const appDir = rel === "" ? APP_ROUTES : path.join(APP_ROUTES, rel);
			const header = "// Hoikka route shim - regenerate with `hoikka sync-routes --write`.\n";

			if (entry === "page.server.ts") {
				const names = exportedNames(full).join(", ");
				out.push({
					appFile: path.join(appDir, "+page.server.ts"),
					content: header + `export { ${names} } from "${spec}/page.server";\n`
				});
				// A server-only route (redirect pages) still needs its empty page file
				if (EMPTY_PAGES.has(rel)) {
					out.push({ appFile: path.join(appDir, "+page.svelte"), content: "" });
				}
			} else if (entry === "layout.server.ts") {
				const names = exportedNames(full).join(", ");
				out.push({
					appFile: path.join(appDir, "+layout.server.ts"),
					content: header + `export { ${names} } from "${spec}/layout.server";\n`
				});
			} else if (entry === "server.ts") {
				const names = exportedNames(full).join(", ");
				out.push({
					appFile: path.join(appDir, "+server.ts"),
					content: header + `export { ${names} } from "${spec}/server";\n`
				});
			} else if (entry === "Page.svelte") {
				const declared = declaredProps(full);
				const props = ["data", "form"].filter((p) => declared.has(p));
				out.push({
					appFile: path.join(appDir, SPECIAL_PAGE_NAME[rel] ?? "+page.svelte"),
					content: componentShim(`${spec}/Page.svelte`, "Page", props)
				});
			} else if (entry === "Layout.svelte") {
				const declared = declaredProps(full);
				const props = ["data", "children"].filter((p) => declared.has(p));
				out.push({
					appFile: path.join(appDir, SPECIAL_LAYOUT_NAME[rel] ?? "+layout.svelte"),
					content: componentShim(`${spec}/Layout.svelte`, "Layout", props)
				});
			} else if (entry === "Error.svelte") {
				const declared = declaredProps(full);
				const props = [...declared].filter((p) => p === "data");
				out.push({
					appFile: path.join(appDir, "+error.svelte"),
					content: componentShim(`${spec}/Error.svelte`, "ErrorPage", props)
				});
			}
		}
	};
	walk(PKG_ROUTES);
	return out;
}

/** Formatting-insensitive equality — prettier may rewrap generated lines. */
function normalized(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

const write = process.argv.includes("--write");
const missing: string[] = [];
const stale: string[] = [];
const kept: string[] = [];

for (const { appFile, content } of expectedShims()) {
	const relative = path.relative(process.cwd(), appFile);
	if (!existsSync(appFile)) {
		missing.push(relative);
		if (write) {
			mkdirSync(path.dirname(appFile), { recursive: true });
			writeFileSync(appFile, content);
		}
		continue;
	}
	const current = readFileSync(appFile, "utf8");
	if (normalized(current) === normalized(content)) continue;
	if (content !== "" && !current.includes(MARKER)) {
		// The user replaced the shim with their own implementation — theirs.
		kept.push(relative);
		continue;
	}
	if (current.trim() === "" && content === "") continue;
	stale.push(relative);
	if (write) writeFileSync(appFile, content);
}

if (kept.length > 0) {
	console.log(`[hoikka] ${kept.length} route(s) overridden by the project (left alone):`);
	for (const file of kept) console.log(`  ${file}`);
}
if (missing.length === 0 && stale.length === 0) {
	console.log("[hoikka] route shims are in sync");
	process.exit(0);
}
for (const file of missing) console.log(`[hoikka] missing shim: ${file}`);
for (const file of stale) console.log(`[hoikka] out-of-date shim: ${file}`);
if (write) {
	console.log(`[hoikka] wrote ${missing.length + stale.length} shim(s)`);
	process.exit(0);
}
console.log("[hoikka] run `hoikka sync-routes --write` to fix");
process.exit(1);
