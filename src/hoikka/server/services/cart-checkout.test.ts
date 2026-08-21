/**
 * Integration tests for the money math: getCartView pricing and
 * startCheckout's draft-order snapshot, against a real migrated in-memory
 * SQLite database (createNodeDb runs the full drizzle/ migration chain,
 * including the FTS table, seed defaults, and stock triggers).
 *
 * $env/dynamic/private is mocked so the db seam connects to ":memory:"
 * instead of the local dev database — vi.mock is hoisted above imports.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import {
	products,
	productVariants,
	customers,
	customerGroups,
	customerGroupMembers,
	productVariantGroupPrices,
	orders,
	orderLines,
	stockReservations
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getCartView } from "./cart.js";
import { orderService } from "./orders.js";
import { promotionService } from "./promotions.js";

let skuCounter = 0;

async function makeProduct(opts: { price: number; stock?: number; trackInventory?: boolean }) {
	const [product] = await db
		.insert(products)
		.values({ name: `Test Product ${++skuCounter}`, slug: `test-product-${skuCounter}` })
		.returning();
	const [variant] = await db
		.insert(productVariants)
		.values({
			productId: product.id,
			sku: `TEST-${skuCounter}`,
			price: opts.price,
			stock: opts.stock ?? 100,
			trackInventory: opts.trackInventory ?? true
		})
		.returning();
	return { product, variant };
}

async function makeCustomer(opts: { groupName?: string; isTaxExempt?: boolean } = {}) {
	const [customer] = await db
		.insert(customers)
		.values({ email: `c${++skuCounter}@test.local`, firstName: "Testi", lastName: "Asiakas" })
		.returning();
	let groupId: number | null = null;
	if (opts.groupName) {
		const [group] = await db
			.insert(customerGroups)
			.values({
				name: opts.groupName,
				code: `group-${skuCounter}`,
				isTaxExempt: opts.isTaxExempt ?? false
			})
			.returning();
		await db
			.insert(customerGroupMembers)
			.values({ groupId: group.id, customerId: customer.id });
		groupId = group.id;
	}
	return { customer, groupId };
}

describe("getCartView", () => {
	it("prices a line and includes VAT in the gross total", async () => {
		const { variant } = await makeProduct({ price: 1000 });

		const view = await getCartView([{ variantId: variant.id, quantity: 2 }], null);

		expect(view.lines).toHaveLength(1);
		expect(view.lines[0].unitPrice).toBe(1000);
		expect(view.lines[0].quantity).toBe(2);
		expect(view.lines[0].lineTotal).toBe(2000);
		// Standard Finnish VAT 25.5% is included in the gross price;
		// the net unit price is rounded per unit, then multiplied
		expect(view.lines[0].taxRate).toBe(0.255);
		expect(view.lines[0].taxAmount).toBe(2000 - Math.round(1000 / 1.255) * 2);
		expect(view.subtotal).toBe(2000);
		expect(view.total).toBe(2000);
		expect(view.itemCount).toBe(2);
	});

	it("clamps quantity to available stock and flags out-of-stock lines", async () => {
		const low = await makeProduct({ price: 500, stock: 1 });
		const none = await makeProduct({ price: 500, stock: 0 });

		const view = await getCartView(
			[
				{ variantId: low.variant.id, quantity: 3 },
				{ variantId: none.variant.id, quantity: 1 }
			],
			null
		);

		const lowLine = view.lines.find((l) => l.variantId === low.variant.id)!;
		const noneLine = view.lines.find((l) => l.variantId === none.variant.id)!;
		expect(lowLine.quantity).toBe(1);
		expect(noneLine.outOfStock).toBe(true);
		// Out-of-stock lines don't count toward totals
		expect(view.subtotal).toBe(500);
		expect(view.itemCount).toBe(1);
	});

	it("ignores untracked inventory limits", async () => {
		const { variant } = await makeProduct({ price: 100, stock: 0, trackInventory: false });

		const view = await getCartView([{ variantId: variant.id, quantity: 5 }], null);

		expect(view.lines[0].quantity).toBe(5);
		expect(view.lines[0].available).toBeNull();
	});

	it("drops deleted variants silently", async () => {
		const { variant } = await makeProduct({ price: 100 });
		await db
			.update(productVariants)
			.set({ deletedAt: new Date() })
			.where(eq(productVariants.id, variant.id));

		const view = await getCartView([{ variantId: variant.id, quantity: 1 }], null);
		expect(view.lines).toHaveLength(0);
	});

	it("applies the lowest matching group price for members", async () => {
		const { variant } = await makeProduct({ price: 1000 });
		const { customer, groupId } = await makeCustomer({ groupName: "B2B" });
		await db
			.insert(productVariantGroupPrices)
			.values({ variantId: variant.id, groupId: groupId!, price: 800 });

		const memberView = await getCartView([{ variantId: variant.id, quantity: 1 }], customer.id);
		const guestView = await getCartView([{ variantId: variant.id, quantity: 1 }], null);

		expect(memberView.lines[0].unitPrice).toBe(800);
		expect(guestView.lines[0].unitPrice).toBe(1000);
	});

	it("zeroes tax for tax-exempt customer groups", async () => {
		const { variant } = await makeProduct({ price: 1240 });
		const { customer } = await makeCustomer({ groupName: "Tax Free", isTaxExempt: true });

		const view = await getCartView([{ variantId: variant.id, quantity: 1 }], customer.id);

		expect(view.isTaxExempt).toBe(true);
		expect(view.taxTotal).toBe(0);
	});

	it("shows automatic promotions in the view (and skips them on request)", async () => {
		const { variant } = await makeProduct({ price: 10000 });
		await promotionService.create({
			method: "automatic",
			title: "Summer Sale",
			promotionType: "order",
			discountType: "percentage",
			discountValue: 10
		});

		const view = await getCartView([{ variantId: variant.id, quantity: 1 }], null);
		expect(view.discount).toBe(1000);
		expect(view.total).toBe(9000);
		expect(view.promotions[0].title).toBe("Summer Sale");

		const skipped = await getCartView([{ variantId: variant.id, quantity: 1 }], null, {
			skipPromotions: true
		});
		expect(skipped.discount).toBe(0);
		expect(skipped.total).toBe(10000);

		// Clean up so later tests aren't affected by the automatic promo
		const promos = await promotionService.list();
		for (const p of promos.items) await promotionService.delete(p.id);
	});
});

describe("startCheckout", () => {
	it("snapshots the cart view into a draft order with reservations", async () => {
		const { variant } = await makeProduct({ price: 2500, stock: 10 });

		const result = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 2 }],
			{}
		);

		expect(result.isNew).toBe(true);
		expect(result.stockErrors).toEqual([]);
		expect(result.order.lines).toHaveLength(1);
		expect(result.order.lines[0].unitPrice).toBe(2500);
		expect(result.order.subtotal).toBe(5000);
		expect(result.order.total).toBe(5000);
		expect(result.order.state).toBe("created");
		expect(result.order.active).toBe(true);

		const reservations = await db
			.select()
			.from(stockReservations)
			.where(eq(stockReservations.orderId, result.order.id));
		expect(reservations).toHaveLength(1);
		expect(reservations[0].quantity).toBe(2);
	});

	it("reuses the draft when the cookie is unchanged and rebuilds when it changed", async () => {
		const a = await makeProduct({ price: 1000 });
		const b = await makeProduct({ price: 2000 });

		const first = await orderService.startCheckout(
			[{ variantId: a.variant.id, quantity: 1 }],
			{}
		);
		const again = await orderService.startCheckout([{ variantId: a.variant.id, quantity: 1 }], {
			checkoutToken: first.checkoutToken
		});
		expect(again.isNew).toBe(false);
		expect(again.order.id).toBe(first.order.id);

		const changed = await orderService.startCheckout(
			[
				{ variantId: a.variant.id, quantity: 1 },
				{ variantId: b.variant.id, quantity: 3 }
			],
			{ checkoutToken: first.checkoutToken }
		);
		expect(changed.order.id).toBe(first.order.id);
		expect(changed.order.lines).toHaveLength(2);
		expect(changed.order.subtotal).toBe(1000 + 3 * 2000);

		const lines = await db
			.select()
			.from(orderLines)
			.where(eq(orderLines.orderId, first.order.id));
		expect(lines).toHaveLength(2);
	});

	it("reports stock errors and clamps when another checkout holds the stock", async () => {
		const { variant } = await makeProduct({ price: 1000, stock: 3 });

		// First shopper reserves 2 of the 3
		await orderService.startCheckout([{ variantId: variant.id, quantity: 2 }], {});

		// Second shopper wants 2 — only 1 available
		const second = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 2 }],
			{}
		);

		expect(second.stockErrors.some((e) => e.includes("only 1 available"))).toBe(true);
		expect(second.order.lines[0].quantity).toBe(1);
	});

	it("applies and recalculates a code promotion on the draft", async () => {
		const { variant } = await makeProduct({ price: 10000 });
		await promotionService.create({
			method: "code",
			code: "TESTI10",
			promotionType: "order",
			discountType: "percentage",
			discountValue: 10
		});

		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		const applied = await orderService.applyPromotion(order.id, "TESTI10");
		expect(applied.success).toBe(true);

		const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(updated.discount).toBe(1000);
		expect(updated.total).toBe(9000);

		const invalid = await orderService.applyPromotion(order.id, "EIOLE");
		expect(invalid.success).toBe(false);
	});
});
