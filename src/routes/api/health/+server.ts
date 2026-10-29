/**
 * Liveness + readiness for deploy healthchecks and uptime monitors. Queries a
 * real table rather than `select 1`: SQLite silently creates an empty file at
 * a wrong DATABASE_URL path, and that must fail too.
 */
import { sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.js";
import type { RequestHandler } from "./$types.js";

const headers = { "cache-control": "no-store" };

export const GET: RequestHandler = async () => {
	try {
		await db.all(sql`select 1 from products limit 1`);
		return Response.json({ ok: true }, { headers });
	} catch (error) {
		console.error("[health] check failed:", error);
		return Response.json({ ok: false }, { status: 503, headers });
	}
};

export const HEAD = GET;
