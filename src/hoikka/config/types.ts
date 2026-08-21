/**
 * The shape of hoikka.config.ts — the one file where a store project declares
 * its content model and settings. Everything here is plain data: the config is
 * imported by server code, client code, and (later) CLI tools alike, so it
 * must never pull in SDKs, SvelteKit modules, or secrets.
 */

/** Custom-field primitives. v1 set — richer types can be added compatibly. */
export type FieldType =
	"text" | "textarea" | "richtext" | "number" | "boolean" | "select" | "image" | "date";

export interface FieldDef {
	/** Storage key inside the entity's custom-fields JSON. */
	key: string;
	/** Label shown in the admin form. */
	label: string;
	type: FieldType;
	/** For type "select": the allowed values. */
	options?: readonly string[];
	required?: boolean;
	/** Help text under the admin input. */
	help?: string;
}

export interface ProductTypeDef {
	label: string;
	fields: readonly FieldDef[];
}

export interface ContentPageTemplateDef {
	label: string;
	fields: readonly FieldDef[];
}

/** A payment or shipping capability declared in config. Pure descriptor —
 * implementations resolve inside the core by `code`; a custom object
 * implementing the provider interface may be passed instead. */
export interface ProviderDescriptor {
	code: string;
	label: string;
	options?: Record<string, unknown>;
}

export interface HoikkaConfigInput {
	store?: {
		/** Store display name: header, page titles, admin. */
		name?: string;
		/** Shown on legal/contact surfaces. */
		supportEmail?: string;
		/** Default From: for transactional email (RESEND_FROM_EMAIL still wins). */
		emailFrom?: string;
	};
	locales?: {
		defaultLanguage?: string;
		languages?: readonly { code: string; name: string }[];
		/** Intl locale for date formatting. */
		dateLocale?: string;
	};
	currency?: {
		/** ISO code stored on orders and shown in the UI. */
		code?: string;
		/** Intl locale used to format amounts. */
		locale?: string;
	};
	tax?: {
		/** Only `true` is supported today: prices are entered and shown gross. */
		pricesIncludeTax?: boolean;
		/** Code of the rate applied when a product has no explicit tax code. */
		defaultRate?: string;
		/** Rates seeded into the database (fractions: 0.255 = 25.5 %). */
		rates?: readonly { code: string; rate: number; name: string }[];
	};
	countries?: {
		/** Prefilled checkout/address country. */
		default?: string;
		/** ISO codes offered in address forms. */
		shipping?: readonly string[];
	};
	payments?: readonly (ProviderDescriptor | object)[];
	shipping?: readonly (ProviderDescriptor | object)[];
	limits?: {
		upload?: { maxImageBytes?: number; maxDeliverableBytes?: number };
		digitalDelivery?: { grantTtlDays?: number; maxDownloads?: number };
		rateLimit?: { checkoutDraftsPerHour?: number };
		pageSize?: { storefront?: number };
		edgeCache?: { backstopSeconds?: number; kvTtlSeconds?: number };
	};
	/** Product types on offer. One type ⇒ the admin type selector is hidden. */
	productTypes?: Record<string, ProductTypeDef>;
	/** The type newly created products get. Must be a key of productTypes. */
	defaultProductType?: string;
	contentPages?: {
		templates?: Record<string, ContentPageTemplateDef>;
	};
	collections?: {
		fields?: readonly FieldDef[];
	};
}

/** The config after defaults are merged — what the rest of the code consumes. */
export interface ResolvedHoikkaConfig {
	store: { name: string; supportEmail: string; emailFrom: string };
	locales: {
		defaultLanguage: string;
		languages: readonly { code: string; name: string }[];
		dateLocale: string;
	};
	currency: { code: string; locale: string };
	tax: {
		pricesIncludeTax: true;
		defaultRate: string;
		rates: readonly { code: string; rate: number; name: string }[];
	};
	countries: { default: string; shipping: readonly string[] };
	payments: readonly (ProviderDescriptor | object)[];
	shipping: readonly (ProviderDescriptor | object)[];
	limits: {
		upload: { maxImageBytes: number; maxDeliverableBytes: number };
		digitalDelivery: { grantTtlDays: number; maxDownloads: number };
		rateLimit: { checkoutDraftsPerHour: number };
		pageSize: { storefront: number };
		edgeCache: { backstopSeconds: number; kvTtlSeconds: number };
	};
	productTypes: Record<string, ProductTypeDef>;
	defaultProductType: string;
	contentPages: { templates: Record<string, ContentPageTemplateDef> };
	collections: { fields: readonly FieldDef[] };
}
