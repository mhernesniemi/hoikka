#!/usr/bin/env node
/**
 * The `hoikka` CLI. Plain JS that registers tsx and dispatches to TypeScript
 * command modules, so the same bin runs whether the core is an embedded
 * workspace package or installed from the registry. tsx is resolved from THIS
 * package's dependencies — the project itself need not depend on it.
 */
import { createRequire } from "node:module";

const COMMANDS = {
	"migrations:stage": "./migrations-stage.ts",
	"sync-routes": "./sync-routes.ts",
	eject: "./eject.ts"
};

const [, , command, ...rest] = process.argv;
if (!command || !COMMANDS[command]) {
	console.error(
		`Usage: hoikka <command>\n\nCommands:\n${Object.keys(COMMANDS)
			.map((name) => `  ${name}`)
			.join("\n")}`
	);
	process.exit(command ? 1 : 0);
}

const requireFromPackage = createRequire(import.meta.url);
const { register } = await import(requireFromPackage.resolve("tsx/esm/api"));
process.argv = [process.argv[0], process.argv[1], ...rest];
register();
await import(new URL(COMMANDS[command], import.meta.url).href);
