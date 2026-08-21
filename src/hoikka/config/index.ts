/**
 * defineHoikkaConfig — merges a project's hoikka.config.ts over the defaults.
 *
 * The defaults reproduce the behavior the starter shipped with before the
 * config file existed, so an empty `defineHoikkaConfig({})` is a valid store.
 */
import type { HoikkaConfigInput, ResolvedHoikkaConfig } from "./types.js";
import { stripe, mockPayment, flatRate } from "./providers.js";

export type { HoikkaConfigInput, ResolvedHoikkaConfig } from "./types.js";
export type {
	FieldDef,
	FieldType,
	ProductTypeDef,
	ContentPageTemplateDef,
	ProviderDescriptor
} from "./types.js";

const DEFAULTS: ResolvedHoikkaConfig = {
	store: {
		name: "Hoikka",
		supportEmail: "support@example.com",
		emailFrom: "noreply@example.com"
	},
	locales: {
		defaultLanguage: "en",
		languages: [
			{ code: "en", name: "English" },
			{ code: "fi", name: "Finnish" }
		],
		dateLocale: "fi-FI"
	},
	currency: { code: "EUR", locale: "fi-FI" },
	tax: {
		pricesIncludeTax: true,
		defaultRate: "standard",
		rates: [
			{ code: "standard", rate: 0.255, name: "Standard VAT (25.5%)" },
			{ code: "food", rate: 0.135, name: "Food VAT (13.5%)" },
			{ code: "books", rate: 0.135, name: "Books VAT (13.5%)" },
			{ code: "zero", rate: 0, name: "Zero VAT (0%)" }
		]
	},
	countries: { default: "FI", shipping: ["FI"] },
	payments: [stripe(), mockPayment()],
	shipping: [flatRate({ amount: 590, estimatedDeliveryDays: 5 })],
	limits: {
		upload: { maxImageBytes: 10 * 1024 * 1024, maxDeliverableBytes: 200 * 1024 * 1024 },
		digitalDelivery: { grantTtlDays: 30, maxDownloads: 10 },
		rateLimit: { checkoutDraftsPerHour: 60 },
		pageSize: { storefront: 40 },
		edgeCache: { backstopSeconds: 300, kvTtlSeconds: 3600 }
	},
	productTypes: {
		physical: { label: "Physical", fields: [] }
	},
	defaultProductType: "physical",
	contentPages: { templates: { default: { label: "Default", fields: [] } } },
	collections: { fields: [] }
};

/** Shallow-merge one config section over its default. */
function section<T extends object>(base: T, override: Partial<T> | undefined): T {
	return override ? { ...base, ...override } : base;
}

export function defineHoikkaConfig(input: HoikkaConfigInput = {}): ResolvedHoikkaConfig {
	const resolved: ResolvedHoikkaConfig = {
		store: section(DEFAULTS.store, input.store),
		locales: section(DEFAULTS.locales, input.locales),
		currency: section(DEFAULTS.currency, input.currency),
		// The input type allows pricesIncludeTax: boolean (rejected below with a
		// real error); the resolved type narrows it to `true`.
		tax: section<{
			pricesIncludeTax: boolean;
			defaultRate: string;
			rates: readonly { code: string; rate: number; name: string }[];
		}>(DEFAULTS.tax, input.tax) as ResolvedHoikkaConfig["tax"],
		countries: section(DEFAULTS.countries, input.countries),
		payments: input.payments ?? DEFAULTS.payments,
		shipping: input.shipping ?? DEFAULTS.shipping,
		limits: {
			upload: section(DEFAULTS.limits.upload, input.limits?.upload),
			digitalDelivery: section(
				DEFAULTS.limits.digitalDelivery,
				input.limits?.digitalDelivery
			),
			rateLimit: section(DEFAULTS.limits.rateLimit, input.limits?.rateLimit),
			pageSize: section(DEFAULTS.limits.pageSize, input.limits?.pageSize),
			edgeCache: section(DEFAULTS.limits.edgeCache, input.limits?.edgeCache)
		},
		productTypes: input.productTypes ?? DEFAULTS.productTypes,
		defaultProductType:
			input.defaultProductType ?? Object.keys(input.productTypes ?? DEFAULTS.productTypes)[0],
		contentPages: {
			templates: input.contentPages?.templates ?? DEFAULTS.contentPages.templates
		},
		collections: section(DEFAULTS.collections, input.collections)
	};

	// Fail at import time, not at checkout time.
	if ((input.tax?.pricesIncludeTax ?? true) !== true) {
		throw new Error(
			"hoikka.config.ts: tax.pricesIncludeTax=false is not supported yet — prices are gross-inclusive throughout"
		);
	}
	if (!resolved.productTypes[resolved.defaultProductType]) {
		throw new Error(
			`hoikka.config.ts: defaultProductType "${resolved.defaultProductType}" is not a key of productTypes`
		);
	}
	if (!resolved.tax.rates.some((rate) => rate.code === resolved.tax.defaultRate)) {
		throw new Error(
			`hoikka.config.ts: tax.defaultRate "${resolved.tax.defaultRate}" is not in tax.rates`
		);
	}

	return resolved;
}
