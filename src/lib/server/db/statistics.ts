import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

/**
 * Refresh the query planner's statistics after a bulk change. Without them it
 * picks bad indexes as the catalog grows; analyzes only tables that changed a
 * lot. Best effort: a target that refuses the pragma mustn't fail the sync.
 */
export async function refreshStatistics(db: Db): Promise<void> {
	try {
		await db.run(sql`PRAGMA optimize`);
	} catch (err) {
		console.warn("[db] PRAGMA optimize failed:", err);
	}
}
