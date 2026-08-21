import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/hoikka/server/db/config.js";

export default defineConfig({
	schema: "./src/hoikka/server/db/schema.ts",
	out: "./src/hoikka/drizzle",
	dialect: "sqlite",
	dbCredentials: { url: resolveDatabaseUrl() },
	verbose: true,
	strict: true
});
