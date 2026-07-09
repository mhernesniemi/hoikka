import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "./schema.js";
import { env } from "$env/dynamic/private";
import { trace } from "@opentelemetry/api";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sqlite = new Database(env.DATABASE_URL);
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA journal_mode = WAL;");

const tracer = trace.getTracer("hoikka");

class OTelLogger implements Logger {
	logQuery(query: string, params: unknown[]): void {
		const span = tracer.startSpan("db.query", {
			attributes: {
				"db.system": "sqlite",
				"db.statement": query,
				"db.params_count": params.length
			}
		});
		span.end();
	}
}

export const db = drizzle(sqlite, { schema, logger: new OTelLogger() });
