/**
 * `hoikka migrations:stage` — copy the package's migration folder into
 * .hoikka/migrations, where wrangler.jsonc's migrations_dir points.
 *
 * Wrangler needs an on-disk directory inside the project; the canonical
 * migrations live inside @hoikka/core (the pnpm store in package mode, the
 * workspace in embedded mode), so they are staged before every
 * `wrangler d1 migrations apply`. The staging dir is gitignored and fully
 * overwritten each run — never edit it.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { migrationsDir } from "../server/db/config.js";

const target = path.join(process.cwd(), ".hoikka", "migrations");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(migrationsDir(), target, { recursive: true });
console.log(`[hoikka] staged migrations -> ${path.relative(process.cwd(), target)}`);
