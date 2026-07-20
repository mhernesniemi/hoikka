/**
 * State-transition safety tests against a real migrated in-memory SQLite:
 * a failed "paid" transition must not leave the order marked paid, and two
 * concurrent completions (payment webhook racing the browser return) must
 * deduct stock exactly once.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import { products, productVariants, orders, orderLines } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { orderService } from "./orders.js";

let counter = 0;

async function makePendingOrder(opts: { stock: number; quantity: number }) {
	const [product] = await db
		.insert(products)
		.values({ name: `Product ${++counter}`, slug: `product-${counter}` })
		.returning();
	const [variant] = await db
		.insert(productVariants)
		.values({
			productId: product.id,
			sku: `SKU-${counter}`,
			price: 1000,
			stock: opts.stock,
			trackInventory: true
		})
		.returning();
	const [order] = await db
		.insert(orders)
		.values({ code: `ORD-T-${counter}`, state: "payment_pending", active: false })
		.returning();
	await db.insert(orderLines).values({
		orderId: order.id,
		variantId: variant.id,
		quantity: opts.quantity,
		unitPrice: 1000,
		lineTotal: 1000 * opts.quantity,
		productName: `Product ${counter}`,
		sku: `SKU-${counter}`
	});
	return { order, variant };
}

describe("transitionState to paid", () => {
	it("leaves the order un-paid when stock validation fails", async () => {
		const { order, variant } = await makePendingOrder({ stock: 1, quantity: 2 });

		await expect(orderService.transitionState(order.id, "paid")).rejects.toThrow(
			/Stock unavailable/
		);

		const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(after.state).toBe("payment_pending"); // not "paid"
		const [variantAfter] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variant.id));
		expect(variantAfter.stock).toBe(1); // untouched
	});

	it("deducts stock exactly once when two completions race", async () => {
		const { order, variant } = await makePendingOrder({ stock: 5, quantity: 2 });

		const results = await Promise.allSettled([
			orderService.transitionState(order.id, "paid"),
			orderService.transitionState(order.id, "paid")
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(after.state).toBe("paid");
		const [variantAfter] = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variant.id));
		expect(variantAfter.stock).toBe(3); // 5 - 2, exactly one deduction
	});
});
