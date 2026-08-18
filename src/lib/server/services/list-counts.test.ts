/**
 * Related-row counts on admin list views come from correlated subqueries. When
 * the outer column reference is rendered unqualified, SQLite resolves it against
 * the subquery's own table instead, silently returning 0. These tests pin the
 * counts with ids that deliberately drift apart between parent and child rows.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { db } from "../db/index.js";
import { products, productVariants, orders, orderLines } from "../db/schema.js";
import { orderService } from "./orders.js";
import { facetService } from "./facets.js";
import { customerGroupService } from "./customerGroups.js";
import { customerService } from "./customers.js";

describe("order list line counts", () => {
	beforeAll(async () => {
		const [product] = await db
			.insert(products)
			.values({ name: "Counted", slug: "counted" })
			.returning();
		const [variant] = await db
			.insert(productVariants)
			.values({ productId: product.id, sku: "SKU-COUNT", price: 1000, stock: 10 })
			.returning();

		for (const [code, lines] of [
			["ORD-C-1", 2],
			["ORD-C-2", 1]
		] as const) {
			const [order] = await db
				.insert(orders)
				.values({ code, state: "paid", active: false })
				.returning();
			for (let i = 0; i < lines; i++) {
				await db.insert(orderLines).values({
					orderId: order.id,
					variantId: variant.id,
					quantity: 1,
					unitPrice: 1000,
					lineTotal: 1000,
					productName: "Counted",
					sku: "SKU-COUNT"
				});
			}
		}
	});

	it("counts the lines belonging to each order", async () => {
		const { items } = await orderService.listPaginated({ limit: 10 });
		const byCode = new Map(items.map((o) => [o.code, o.lineCount]));
		expect(byCode.get("ORD-C-1")).toBe(2);
		expect(byCode.get("ORD-C-2")).toBe(1);
	});
});

describe("facet list value counts", () => {
	beforeAll(async () => {
		const first = await facetService.create({ code: "color", name: "Color" });
		await facetService.createValue({ facetId: first.id, code: "red", name: "Red" });
		await facetService.createValue({ facetId: first.id, code: "blue", name: "Blue" });

		const second = await facetService.create({ code: "size", name: "Size" });
		await facetService.createValue({ facetId: second.id, code: "large", name: "Large" });
	});

	it("counts the values belonging to each facet", async () => {
		const { items } = await facetService.listPaginated({ limit: 10 });
		const byCode = new Map(items.map((f) => [f.code, f.valueCount]));
		expect(byCode.get("color")).toBe(2);
		expect(byCode.get("size")).toBe(1);
	});
});

describe("customer group list member counts", () => {
	beforeAll(async () => {
		const wholesale = await customerGroupService.create({ name: "Wholesale" });
		const retail = await customerGroupService.create({ name: "Retail" });

		for (let i = 0; i < 3; i++) {
			const customer = await customerService.create({
				email: `member-${i}@example.com`,
				firstName: "Member",
				lastName: `${i}`
			});
			await customerGroupService.addCustomer(i === 2 ? retail.id : wholesale.id, customer.id);
		}
	});

	it("counts the customers belonging to each group", async () => {
		const { items } = await customerGroupService.listPaginated({ limit: 10 });
		const byName = new Map(items.map((g) => [g.name, g.customerCount]));
		expect(byName.get("Wholesale")).toBe(2);
		expect(byName.get("Retail")).toBe(1);
	});
});
