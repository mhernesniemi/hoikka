/**
 * The custom-field pipeline: config declares, forms submit strings, valibot
 * validates, the JSON column stores, the accessor reads back typed.
 */
import { describe, it, expect } from "vitest";
import {
	parseFields,
	customFields,
	coerceFormFields,
	fieldEntries,
	formFields,
	type FieldDef
} from "./index.js";

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

describe("fieldEntries", () => {
	it("pairs set values with their definitions in definition order", () => {
		const page = {
			customFields: { badge: "/uploads/a.webp", material: "Wool", limited: false, stale: "x" }
		};
		expect(fieldEntries(DEFS, page)).toEqual([
			{ def: DEFS[0], value: "Wool" },
			{ def: DEFS[2], value: false },
			{ def: DEFS[5], value: "/uploads/a.webp" }
		]);
	});

	it("skips empty strings and tolerates a null column", () => {
		expect(fieldEntries(DEFS, { customFields: { material: "" } })).toEqual([]);
		expect(fieldEntries(DEFS, { customFields: null })).toEqual([]);
	});
});

describe("formFields", () => {
	const defs = [
		{ key: "notes", label: "Notes", type: "richtext" },
		{ key: "grade", label: "Grade", type: "text", required: true, readOnly: true },
		{ key: "stockM", label: "Stock (m)", type: "number", readOnly: true }
	] as const satisfies readonly FieldDef[];
	const sanitize = (html: string) => html.replace(/<script>.*<\/script>/, "");

	it("keeps stored read-only values over anything the form sends", () => {
		const form = new FormData();
		form.set("cf_notes", "<p>Hi</p><script>x</script>");
		form.set("cf_grade", "tampered");

		const result = formFields(defs, form, { grade: "1.4301", stockM: 120 }, sanitize);

		expect(result).toEqual({
			ok: true,
			values: { notes: "<p>Hi</p>", grade: "1.4301", stockM: 120 }
		});
	});

	it("doesn't require a read-only field the form can't send", () => {
		expect(formFields(defs, new FormData(), null, sanitize)).toEqual({ ok: true, values: {} });
	});

	it("takes only what the caller lets the form edit, e.g. a customer's own fields", () => {
		const customerDefs = [
			{ key: "contact", label: "Contact", type: "text", storefront: "edit" },
			{ key: "creditLimit", label: "Credit limit", type: "number" }
		] as const satisfies readonly FieldDef[];
		const form = new FormData();
		form.set("cf_contact", "Liisa");
		form.set("cf_creditLimit", "999999");

		const result = formFields(
			customerDefs,
			form,
			{ creditLimit: 5000 },
			sanitize,
			(def) => def.storefront === "edit"
		);

		expect(result).toEqual({ ok: true, values: { contact: "Liisa", creditLimit: 5000 } });
	});
});
