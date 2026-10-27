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
	/**
	 * Written by code (e.g. an ERP sync), not by people: the admin shows the
	 * value but can't change it, so a save never overwrites what code wrote.
	 */
	readOnly?: boolean;
	/**
	 * Customer fields only: whether the customer sees the value on their
	 * account page, or can also edit it there. Default: "hidden".
	 */
	storefront?: "hidden" | "read" | "edit";
}

export type Fulfillment = "physical" | "digital";

export interface ProductTypeDef {
	label: string;
	fields: readonly FieldDef[];
	/**
	 * Shipped, or delivered as a download after payment. Default: "digital"
	 * for a type keyed `digital`, otherwise "physical".
	 */
	fulfillment?: Fulfillment;
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

/** An OpenID Connect provider staff sign in with. Pure data; secrets come from env. */
export interface SsoProvider {
	/**
	 * Lowercase id. Used in the callback URL (/api/auth/callback/<id>)
	 * and the env names: SSO_<ID>_CLIENT_ID, SSO_<ID>_CLIENT_SECRET and the
	 * optional SSO_<ID>_DISCOVERY_URL override (e.g. a local mock).
	 */
	id: string;
	/** Button text: "Sign in with <label>". */
	label: string;
	discoveryUrl: string;
	/** ID-token claims that must have exactly these values, e.g. Entra's tenant `tid`. */
	requireClaims?: Record<string, string>;
}

export type StaffRole = "admin" | "staff";

export interface StaffSsoConfig {
	providers: readonly SsoProvider[];
	/**
	 * Which ID-token claim carries the person's roles or groups (a dotted path
	 * for nested claims, e.g. "realm_access.roles"), and how its values map to
	 * Hoikka roles. The highest match wins; no match means no access.
	 */
	roles: { claim: string; map: Record<string, StaffRole> };
	/**
	 * Let staff also sign in with a password. Off by default: the identity
	 * provider decides who is staff. ADMIN_PASSWORD_LOGIN=true turns it on
	 * without a deploy, e.g. while the provider is down.
	 */
	passwordLogin?: boolean;
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
	customers?: {
		/**
		 * Let visitors create their own accounts (sign-up page and API, first
		 * Google or email-code sign-in). `false` closes the store to new sign-ups,
		 * e.g. for B2B; existing accounts still sign in.
		 */
		signUp?: boolean;
		/**
		 * Only signed-in visitors see the storefront; everyone else is sent to
		 * the sign-in page. For portals and closed B2B stores.
		 */
		requireSignIn?: boolean;
		/** Custom fields on customers, e.g. an ERP customer number or credit limit. */
		fields?: readonly FieldDef[];
	};
	admin?: {
		/**
		 * Staff sign in through an identity provider (Microsoft Entra ID, Okta,
		 * Google Workspace, any OIDC provider), with roles from its claims.
		 */
		sso?: StaffSsoConfig;
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
	productTypes: Record<string, ProductTypeDef & { fulfillment: Fulfillment }>;
	defaultProductType: string;
	contentPages: { templates: Record<string, ContentPageTemplateDef> };
	collections: { fields: readonly FieldDef[] };
	customers: { signUp: boolean; requireSignIn: boolean; fields: readonly FieldDef[] };
	admin: { sso: (StaffSsoConfig & { passwordLogin: boolean }) | null };
}

/**
 * The resolved config with the field lists exactly as hoikka.config.ts wrote
 * them, so `customFields(config.productTypes.physical.fields, product)` is typed.
 * Lookups by a runtime key (`productTypes[product.type]`) still work.
 */
export type HoikkaConfig<I extends HoikkaConfigInput = HoikkaConfigInput> = Omit<
	ResolvedHoikkaConfig,
	"productTypes" | "contentPages" | "collections" | "customers"
> & {
	productTypes: ResolvedHoikkaConfig["productTypes"] &
		(I extends { productTypes: infer P }
			? { [K in keyof P]: P[K] & { fulfillment: Fulfillment } }
			: unknown);
	contentPages: {
		templates: ResolvedHoikkaConfig["contentPages"]["templates"] &
			(I extends { contentPages: { templates: infer T } } ? T : unknown);
	};
	collections: {
		fields: I extends { collections: { fields: infer F extends readonly FieldDef[] } }
			? F
			: readonly FieldDef[];
	};
	customers: Omit<ResolvedHoikkaConfig["customers"], "fields"> & {
		fields: I extends { customers: { fields: infer F extends readonly FieldDef[] } }
			? F
			: readonly FieldDef[];
	};
};
