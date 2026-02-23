import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import { db } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

async function hasAdminUser(): Promise<boolean> {
	try {
		const result = await db.execute<{ id: string }>(
			sql`SELECT id FROM neon_auth."user" WHERE role = 'admin' LIMIT 1`
		);
		return result.rows.length > 0;
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	// Get featured products (public only, limited to 2 for demo layout)
	const result = await productService.list({
		visibility: "public",
		limit: 2
	});

	await stampGroupPrices(result.items, locals.customer?.id ?? null);

	return {
		featuredProducts: result.items,
		hasAdmin: await hasAdminUser()
	};
};
