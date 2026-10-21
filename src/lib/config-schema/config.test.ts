/**
 * hoikka.config.ts is the public contract of a store project — the defaults
 * must be a complete, working store, and misconfigurations must fail at
 * import time with a message that names the problem.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { defineHoikkaConfig } from "./index.js";
import { customFields } from "$lib/fields/index.js";
import { stripe, flatRate, entraId } from "./providers.js";

describe("defineHoikkaConfig", () => {
	it("is a complete store with no input at all", () => {
		const config = defineHoikkaConfig({});
		expect(config.store.name).toBe("Hoikka");
		expect(config.currency.code).toBe("EUR");
		expect(config.tax.rates.length).toBeGreaterThan(0);
		expect(config.productTypes.physical).toBeDefined();
		expect(config.defaultProductType).toBe("physical");
		expect(config.limits.digitalDelivery.maxDownloads).toBe(10);
		expect(config.customers).toEqual({ signUp: true, requireSignIn: false, fields: [] });
	});

	it("has no staff SSO unless configured, and closes staff passwords by default", () => {
		expect(defineHoikkaConfig({}).admin.sso).toBeNull();
		const sso = defineHoikkaConfig({
			admin: {
				sso: { providers: [entraId({ tenantId: "t" })], roles: { claim: "roles", map: {} } }
			}
		}).admin.sso;
		expect(sso?.passwordLogin).toBe(false);
	});

	it("rejects bad SSO provider ids and roles", () => {
		const roles = { claim: "roles", map: {} };
		const provider = entraId({ tenantId: "t" });
		expect(() =>
			defineHoikkaConfig({ admin: { sso: { providers: [provider, provider], roles } } })
		).toThrow(/used twice/);
		expect(() =>
			defineHoikkaConfig({
				admin: { sso: { providers: [{ ...provider, id: "My IdP" }], roles } }
			})
		).toThrow(/lowercase/);
		expect(() =>
			defineHoikkaConfig({
				admin: {
					sso: {
						providers: [provider],
						roles: { claim: "roles", map: { X: "owner" as "admin" } }
					}
				}
			})
		).toThrow(/expected admin or staff/);
	});

	it("keeps the declared fields' types for customFields", () => {
		const config = defineHoikkaConfig({
			productTypes: {
				physical: {
					label: "Physical",
					fields: [
						{ key: "heightMm", label: "Height", type: "number" },
						{
							key: "finish",
							label: "Finish",
							type: "select",
							options: ["matt", "gloss"]
						}
					]
				}
			},
			collections: { fields: [{ key: "subtitle", label: "Subtitle", type: "text" }] },
			customers: { fields: [{ key: "creditLimit", label: "Credit limit", type: "number" }] }
		});
		const product = { customFields: { heightMm: 40, finish: "matt" } };
		const fields = customFields(config.productTypes.physical.fields, product);
		expectTypeOf(fields.heightMm).toEqualTypeOf<number | undefined>();
		expectTypeOf(fields.finish).toEqualTypeOf<"matt" | "gloss" | undefined>();
		expect(fields).toEqual({ heightMm: 40, finish: "matt" });
		expectTypeOf(
			customFields(config.collections.fields, { customFields: {} }).subtitle
		).toEqualTypeOf<string | undefined>();
		expectTypeOf(
			customFields(config.customers.fields, { customFields: {} }).creditLimit
		).toEqualTypeOf<number | undefined>();
		const anyType: string = "physical";
		expectTypeOf(config.productTypes[anyType]).toMatchTypeOf<{ label: string } | undefined>();
	});

	it("can close the store to new sign-ups", () => {
		expect(defineHoikkaConfig({ customers: { signUp: false } }).customers.signUp).toBe(false);
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
