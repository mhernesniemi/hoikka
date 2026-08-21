/** Country settings, derived from hoikka.config.ts — edit the config, not this file. */
import config from "$hoikka/config";

export const DEFAULT_COUNTRY = config.countries.default;

const displayNames = new Intl.DisplayNames([config.locales.defaultLanguage], { type: "region" });

/** ISO code + display name for every country the store ships to. */
export const SHIPPING_COUNTRIES = config.countries.shipping.map((code) => ({
	code,
	name: displayNames.of(code) ?? code
}));
