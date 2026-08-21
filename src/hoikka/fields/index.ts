/**
 * Custom fields: config-declared, JSON-stored, valibot-validated.
 *
 * hoikka.config.ts declares fields on product types, content-page templates
 * and collections; the values live in one `custom_fields` JSON column per
 * entity. The config is the schema — there is no codegen and nothing to
 * migrate when a field is added or removed. Unknown keys are dropped on
 * write, so removing a field from config quietly retires its data.
 */
import * as v from "valibot";
import type { FieldDef } from "@hoikka/core/config/types";

export type { FieldDef, FieldType } from "@hoikka/core/config/types";

/** The TypeScript value type for one field definition. */
type FieldValue<F extends FieldDef> = F["type"] extends "number"
	? number
	: F["type"] extends "boolean"
		? boolean
		: F["type"] extends "select"
			? F["options"] extends readonly string[]
				? F["options"][number]
				: string
			: string;

/**
 * Typed shape of a fields object for a `const` field-definition array:
 *
 *   const fields = config.productTypes.physical.fields;
 *   type Physical = InferFields<typeof fields>;
 */
export type InferFields<Defs extends readonly FieldDef[]> = {
	[F in Defs[number] as F["key"]]?: FieldValue<F>;
};

function valueSchema(def: FieldDef) {
	switch (def.type) {
		case "number":
			return v.number();
		case "boolean":
			return v.boolean();
		case "select":
			return def.options && def.options.length > 0
				? v.picklist(def.options as [string, ...string[]])
				: v.string();
		case "date":
			// ISO date string from <input type="date">
			return v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"));
		case "image":
			// An /uploads/... URL from the asset picker
			return v.pipe(v.string(), v.maxLength(500));
		case "richtext":
		case "textarea":
			return v.pipe(v.string(), v.maxLength(100_000));
		case "text":
		default:
			return v.pipe(v.string(), v.maxLength(2_000));
	}
}

/** Valibot object schema for a set of field definitions. */
export function fieldsSchema(defs: readonly FieldDef[]) {
	const entries: Record<string, v.GenericSchema> = {};
	for (const def of defs) {
		const base = valueSchema(def);
		entries[def.key] = def.required ? base : v.optional(base);
	}
	// strictObject drops nothing silently — unknown keys are an error, which
	// parseFields converts into "not part of this type any more".
	return v.object(entries);
}

/**
 * Validate raw values (e.g. from a form) against the definitions. Keys not in
 * the definitions are discarded; a validation failure reports the field key.
 */
export function parseFields(
	defs: readonly FieldDef[],
	raw: Record<string, unknown>
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
	const known: Record<string, unknown> = {};
	for (const def of defs) {
		if (raw[def.key] !== undefined) known[def.key] = raw[def.key];
	}
	const result = v.safeParse(fieldsSchema(defs), known);
	if (!result.success) {
		const issue = result.issues[0];
		const key = issue.path?.[0]?.key ?? "field";
		return { ok: false, error: `${String(key)}: ${issue.message}` };
	}
	return { ok: true, values: result.output };
}

/**
 * Run richtext values through the caller's HTML sanitizer. Storefronts render
 * these with {@html ...}, so sanitize-on-save is not optional.
 */
export function sanitizeRichtextFields(
	defs: readonly FieldDef[],
	values: Record<string, unknown>,
	sanitize: (html: string) => string
): Record<string, unknown> {
	const out = { ...values };
	for (const def of defs) {
		if (def.type === "richtext" && typeof out[def.key] === "string") {
			out[def.key] = sanitize(out[def.key] as string);
		}
	}
	return out;
}

/**
 * Read an entity's custom fields with the types the definitions imply.
 *
 *   const fields = customFields(config.productTypes.physical.fields, product);
 *   fields.material  // string | undefined
 */
export function customFields<Defs extends readonly FieldDef[]>(
	defs: Defs,
	entity: { customFields?: Record<string, unknown> | null }
): InferFields<Defs> {
	const stored = entity.customFields ?? {};
	const out: Record<string, unknown> = {};
	for (const def of defs) {
		if (stored[def.key] !== undefined) out[def.key] = stored[def.key];
	}
	return out as InferFields<Defs>;
}

/**
 * Convert submitted form-data strings into the value types the definitions
 * expect (checkbox "on" → boolean, numeric string → number, empty → absent).
 */
export function coerceFormFields(
	defs: readonly FieldDef[],
	formData: FormData,
	prefix = "cf_"
): Record<string, unknown> {
	const raw: Record<string, unknown> = {};
	for (const def of defs) {
		const value = formData.get(`${prefix}${def.key}`);
		if (def.type === "boolean") {
			raw[def.key] = value === "on" || value === "true";
			continue;
		}
		if (value === null || value === "") continue;
		raw[def.key] = def.type === "number" ? Number(value) : String(value);
	}
	return raw;
}
