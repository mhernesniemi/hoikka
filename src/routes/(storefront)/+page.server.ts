import { productService, stampGroupPrices } from "$lib/server/services/products.js";
import { db } from "$lib/server/db/index.js";
import { user } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

async function hasAdminUser(): Promise<boolean> {
	const admin = await db.query.user.findFirst({
		where: eq(user.role, "admin"),
		columns: { id: true }
	});
	return !!admin;
}

export const load: PageServerLoad = async ({ locals }) => {
	const result = await productService.list({ visibility: "public", limit: 2 });
	await stampGroupPrices(result.items, locals.customer?.id ?? null);

	return {
		featuredProducts: result.items,
		hasAdmin: await hasAdminUser()
	};
};
