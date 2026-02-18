import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "./schema.js";
import { env } from "$env/dynamic/private";
import { trace, SpanStatusCode } from "@opentelemetry/api";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = neon(env.DATABASE_URL);

const tracer = trace.getTracer("hoikka");

class OTelLogger implements Logger {
	logQuery(query: string, params: unknown[]): void {
		const span = tracer.startSpan("db.query", {
			attributes: {
				"db.system": "postgresql",
				"db.statement": query,
				"db.params_count": params.length
			}
		});
		span.end();
	}
}

export const db = drizzle(sql, { schema, logger: new OTelLogger() });
