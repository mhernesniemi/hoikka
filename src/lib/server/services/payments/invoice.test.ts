/**
 * The invoice method charges nothing online: configured in hoikka.config.ts,
 * it is offered at checkout and its payment settles at once.
 */
import { describe, it, expect, vi } from "vitest";
import { invoice } from "#lib/config-schema/providers.js";

vi.mock("#hoikka/config", async (importOriginal) => {
	const { default: config } = await importOriginal<typeof import("#hoikka/config")>();
	return { default: { ...config, payments: [invoice()] } };
});

import { db } from "../../db/index.js";
import { products, productVariants } from "../../db/schema.js";
import { orderService } from "../orders.js";
import { syncConfiguredMethods } from "../method-sync.js";
import { paymentService } from "./index.js";

describe("invoice payments", () => {
	it("are offered when configured and settle without a gateway", async () => {
		await syncConfiguredMethods();
		const methods = await paymentService.getActiveMethods();
		expect(methods.map((m) => m.code)).toEqual(["invoice"]);

		const [product] = await db
			.insert(products)
			.values({ name: "Pallet", slug: "pallet" })
			.returning();
		const [variant] = await db
			.insert(productVariants)
			.values({ productId: product.id, sku: "INV-1", price: 12000, stock: 5 })
			.returning();
		const { order } = await orderService.startCheckout(
			[{ variantId: variant.id, quantity: 1 }],
			{}
		);
		const draft = (await orderService.getById(order.id))!;

		const { payment } = await paymentService.createPayment(draft, methods[0].id);
		expect(payment.transactionId).toMatch(/^invoice_/);
		expect(await paymentService.confirmPayment(payment.id)).toMatchObject({
			status: "settled"
		});
	});
});
