/**
 * hoikka.config.ts is the public contract of a store project — the defaults
 * must be a complete, working store, and misconfigurations must fail at
 * import time with a message that names the problem.
 */
import { describe, it, expect } from "vitest";
import { defineHoikkaConfig } from "./index.js";
import { stripe, flatRate } from "./providers.js";

describe("defineHoikkaConfig", () => {
	it("is a complete store with no input at all", () => {
		const config = defineHoikkaConfig({});
		expect(config.store.name).toBe("Hoikka");
		expect(config.currency.code).toBe("EUR");
		expect(config.tax.rates.length).toBeGreaterThan(0);
		expect(config.productTypes.physical).toBeDefined();
		expect(config.defaultProductType).toBe("physical");
		expect(config.limits.digitalDelivery.maxDownloads).toBe(10);
	});

	it("merges a section without wiping its siblings", () => {
		const config = defineHoikkaConfig({ store: { name: "Kukkakauppa" } });
		expect(config.store.name).toBe("Kukkakauppa");
		expect(config.store.emailFrom).toBe("noreply@example.com");
		expect(config.currency.code).toBe("EUR");
	});

	it("derives the default product type from the declared types", () => {
		const config = defineHoikkaConfig({
			productTypes: { digital: { label: "Digital", fields: [] } }
		});
		expect(config.defaultProductType).toBe("digital");
	});

	it("rejects a default product type that is not declared", () => {
		expect(() =>
			defineHoikkaConfig({
				productTypes: { physical: { label: "P", fields: [] } },
				defaultProductType: "digital"
			})
		).toThrow(/defaultProductType/);
	});

	it("rejects a default tax rate that is not in the table", () => {
		expect(() =>
			defineHoikkaConfig({
				tax: { defaultRate: "vat99", rates: [{ code: "standard", rate: 0.24, name: "x" }] }
			})
		).toThrow(/defaultRate/);
	});

	it("refuses net pricing until it is actually supported", () => {
		expect(() => defineHoikkaConfig({ tax: { pricesIncludeTax: false } })).toThrow(
			/pricesIncludeTax/
		);
	});

	it("provider factories return plain data, never SDK clients", () => {
		const descriptor = stripe({ manualCapture: true });
		expect(descriptor).toEqual({
			code: "stripe",
			label: "Stripe",
			options: { manualCapture: true }
		});
		expect(flatRate({ amount: 990 }).options).toMatchObject({ amount: 990 });
	});
});
