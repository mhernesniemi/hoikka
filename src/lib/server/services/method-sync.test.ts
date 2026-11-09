/**
 * Configured labels against the rows migration 0002 seeded (real in-memory
 * SQLite, full migration chain).
 */
import { describe, it, expect, vi } from "vitest";
import { flatRate, mockPayment, stripe } from "#lib/config-schema/providers.js";

vi.mock("#hoikka/config", async (importOriginal) => {
	const { default: config } = await importOriginal<typeof import("#hoikka/config")>();
	return {
		default: {
			...config,
			payments: [stripe(), mockPayment()],
			shipping: [flatRate({ label: "Kotimaan toimitus" })]
		}
	};
});

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { paymentMethods, shippingMethods } from "../db/schema.js";
import { syncConfiguredMethods } from "./method-sync.js";

describe("syncConfiguredMethods", () => {
	it("gives a seeded row its configured label and keeps names an admin set", async () => {
		await db
			.update(paymentMethods)
			.set({ name: "Card" })
			.where(eq(paymentMethods.code, "stripe"));

		await syncConfiguredMethods();

		const [shipping] = await db
			.select()
			.from(shippingMethods)
			.where(eq(shippingMethods.code, "flat_rate"));
		expect(shipping.name).toBe("Kotimaan toimitus");

		const [card] = await db
			.select()
			.from(paymentMethods)
			.where(eq(paymentMethods.code, "stripe"));
		expect(card.name).toBe("Card");
	});
});
