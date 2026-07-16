import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/lib/server/db/config.js";

export default defineConfig({
	schema: "./src/lib/server/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: { url: resolveDatabaseUrl() },
	verbose: true,
	strict: true
});
