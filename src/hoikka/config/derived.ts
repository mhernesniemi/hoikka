/**
 * Values derived from hoikka.config.ts for everyday use — languages, locale,
 * product types, store identity, countries. Edit the config, not this file.
 */
import config from "$hoikka/config";
import type { ProductType } from "@hoikka/core/shared/types";

// ── Languages ────────────────────────────────────────────────────────────────

/** Default language — stored directly on entity tables */
export const DEFAULT_LANGUAGE = config.locales.defaultLanguage;

/** All supported languages */
export const LANGUAGES = config.locales.languages;

/** Languages that use translation tables (everything except default) */
export const TRANSLATION_LANGUAGES = LANGUAGES.filter((l) => l.code !== DEFAULT_LANGUAGE);

/** Convert translation rows into a map: { fi: { name: "...", slug: "..." } } */
export function translationsToMap<T extends { languageCode: string }>(
	rows: T[]
): Record<string, Record<string, string | null>> {
	const map: Record<string, Record<string, string | null>> = {};

	for (const row of rows) {
		const { languageCode, ...fields } = row;
		const fieldMap: Record<string, string | null> = {};

		for (const [key, value] of Object.entries(fields)) {
			if (typeof value === "string" || value === null) {
				fieldMap[key] = value;
			}
		}

		map[languageCode] = fieldMap;
	}

	return map;
}

// ── Locale ───────────────────────────────────────────────────────────────────

export const DATE_LOCALE = config.locales.dateLocale;

// ── Product types ────────────────────────────────────────────────────────────

export const PRODUCT_TYPES = Object.keys(config.productTypes) as ProductType[];
export const DEFAULT_PRODUCT_TYPE = config.defaultProductType as ProductType;

// ── Store identity ───────────────────────────────────────────────────────────

export const STORE_NAME = config.store.name;
export const SUPPORT_EMAIL = config.store.supportEmail;

// ── Countries ────────────────────────────────────────────────────────────────

export const DEFAULT_COUNTRY = config.countries.default;

const displayNames = new Intl.DisplayNames([config.locales.defaultLanguage], { type: "region" });

/** ISO code + display name for every country the store ships to. */
export const SHIPPING_COUNTRIES = config.countries.shipping.map((code) => ({
	code,
	name: displayNames.of(code) ?? code
}));
