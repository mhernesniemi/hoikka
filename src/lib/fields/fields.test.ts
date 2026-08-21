/**
 * The custom-field pipeline: config declares, forms submit strings, valibot
 * validates, the JSON column stores, the accessor reads back typed.
 */
import { describe, it, expect } from "vitest";
import { parseFields, customFields, coerceFormFields, type FieldDef } from "./index.js";

const DEFS = [
	{ key: "material", label: "Material", type: "text" },
	{ key: "weightGrams", label: "Weight", type: "number" },
	{ key: "limited", label: "Limited edition", type: "boolean" },
	{ key: "origin", label: "Origin", type: "select", options: ["FI", "SE"] },
	{ key: "releasedOn", label: "Released", type: "date" },
	{ key: "badge", label: "Badge", type: "image" }
] as const satisfies readonly FieldDef[];

describe("parseFields", () => {
	it("accepts values matching the definitions", () => {
		const result = parseFields(DEFS, {
			material: "Wool",
			weightGrams: 250,
			limited: true,
			origin: "FI",
			releasedOn: "2026-08-01",
			badge: "/uploads/products/badge-abc.webp"
		});
		expect(result).toEqual({
			ok: true,
			values: {
				material: "Wool",
				weightGrams: 250,
				limited: true,
				origin: "FI",
				releasedOn: "2026-08-01",
				badge: "/uploads/products/badge-abc.webp"
			}
		});
	});

	it("names the offending field on a type mismatch", () => {
		const result = parseFields(DEFS, { weightGrams: "heavy" });
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toContain("weightGrams");
	});

	it("rejects a select value outside its options", () => {
		expect(parseFields(DEFS, { origin: "DE" }).ok).toBe(false);
	});

	it("rejects a malformed date", () => {
		expect(parseFields(DEFS, { releasedOn: "01.08.2026" }).ok).toBe(false);
	});

	it("drops keys that are no longer declared", () => {
		const result = parseFields(DEFS, { material: "Wool", retiredField: "x" });
		expect(result.ok && result.values).toEqual({ material: "Wool" });
	});

	it("enforces required fields", () => {
		const defs = [{ key: "material", label: "M", type: "text", required: true }] as const;
		expect(parseFields(defs, {}).ok).toBe(false);
		expect(parseFields(defs, { material: "Wool" }).ok).toBe(true);
	});
});

describe("coerceFormFields", () => {
	it("converts form strings into the declared types", () => {
		const form = new FormData();
		form.set("cf_material", "Wool");
		form.set("cf_weightGrams", "250");
		form.set("cf_limited", "on");
		form.set("cf_releasedOn", "2026-08-01");

		expect(coerceFormFields(DEFS, form)).toEqual({
			material: "Wool",
			weightGrams: 250,
			limited: true,
			releasedOn: "2026-08-01"
		});
	});

	it("treats empty inputs as absent, unchecked boxes as false", () => {
		const form = new FormData();
		form.set("cf_material", "");
		expect(coerceFormFields(DEFS, form)).toEqual({ limited: false });
	});
});

describe("customFields accessor", () => {
	it("reads only declared keys, typed", () => {
		const product = { customFields: { material: "Wool", stale: "gone", weightGrams: 250 } };
		const fields = customFields(DEFS, product);
		expect(fields).toEqual({ material: "Wool", weightGrams: 250 });
		// Type-level check: origin narrows to the select options
		const origin: "FI" | "SE" | undefined = fields.origin;
		expect(origin).toBeUndefined();
	});

	it("tolerates a null column", () => {
		expect(customFields(DEFS, { customFields: null })).toEqual({});
	});
});
