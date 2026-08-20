/**
 * The mock provider settles payments without moving money. Outside
 * development it must be neither offered nor chargeable, even though the
 * seed migration leaves the `mock` payment method enabled in the database.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
vi.mock("$app/environment", () => ({ dev: false, browser: false, building: false }));

import { db } from "../db/index.js";
import { paymentMethods, products, productVariants } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { orderService } from "./orders.js";
import { paymentService } from "./payments/index.js";

describe("payment method availability outside development", () => {
	it("keeps the seeded-but-unconfigured methods out of checkout", async () => {
		// The rows are there and enabled...
		const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.active, true));
		expect(rows.map((m) => m.code)).toContain("mock");

		// ...but neither provider is usable here (no dev, no Stripe key)
		expect(await paymentService.getActiveMethods()).toEqual([]);
	});

	it("refuses to charge a method whose provider is unavailable", async () => {
		const [product] = await db
			.insert(products)
			.values({ name: "Chair", slug: "chair-prod" })
			.returning();
		const [variant] = await db
			.insert(productVariants)
			.values({ productId: product.id, sku: "PROD-1", price: 4900, stock: 5 })
			.returning();

		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		const draft = (await orderService.getById(order.id))!;
		const mock = await paymentService.getMethodByCode("mock");

		await expect(paymentService.createPayment(draft, mock!.id)).rejects.toThrow(
			/not available/i
		);
	});

	it("refuses to charge a method the admin disabled", async () => {
		const stripe = await paymentService.getMethodByCode("stripe");
		await db
			.update(paymentMethods)
			.set({ active: false })
			.where(eq(paymentMethods.id, stripe!.id));

		const [product] = await db
			.insert(products)
			.values({ name: "Table", slug: "table-prod" })
			.returning();
		const [variant] = await db
			.insert(productVariants)
			.values({ productId: product.id, sku: "PROD-2", price: 4900, stock: 5 })
			.returning();
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		const draft = (await orderService.getById(order.id))!;

		await expect(paymentService.createPayment(draft, stripe!.id)).rejects.toThrow(
			/not active/i
		);
	});
});
