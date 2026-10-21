/**
 * Provider descriptor factories for hoikka.config.ts.
 *
 * These return plain data — never SDK clients — so the config file stays
 * importable everywhere (server, client bundles, CLI tools). The core maps
 * each `code` to its implementation; passing an object that implements the
 * PaymentProvider/ShippingProvider interface instead registers a custom one.
 */
import type { ProviderDescriptor, SsoProvider } from "./types.js";

export interface StripeOptions {
	/**
	 * Authorise on confirmation and capture only after the order commits, so a
	 * lost stock race voids a hold instead of refunding a charge. Off by
	 * default: manual capture removes payment methods that don't support it
	 * (iDEAL, Bancontact, SEPA debit, ...) from the Payment Element and holds
	 * expire in ~7 days. STRIPE_MANUAL_CAPTURE=true still overrides.
	 */
	manualCapture?: boolean;
}

export function stripe(options: StripeOptions = {}): ProviderDescriptor {
	return { code: "stripe", label: "Stripe", options: { ...options } };
}

/** Settles instantly without moving money. Dev/test only — the core refuses
 * to offer it outside dev unless ENABLE_MOCK_PAYMENTS=true. */
export function mockPayment(): ProviderDescriptor {
	return { code: "mock", label: "Mock Payment", options: {} };
}

export interface FlatRateOptions {
	/** Rate in minor units (cents). */
	amount?: number;
	label?: string;
	estimatedDeliveryDays?: number;
	description?: string;
}

export function flatRate(options: FlatRateOptions = {}): ProviderDescriptor {
	return {
		code: "flat_rate",
		label: options.label ?? "Standard Shipping",
		options: { ...options }
	};
}

// ── Staff sign-in (admin.sso.providers) ──────────────────────────────────────

/** Microsoft Entra ID (Azure AD). Roles: app roles in the `roles` claim. */
export function entraId(options: { tenantId: string; label?: string }): SsoProvider {
	return {
		id: "entra",
		label: options.label ?? "Microsoft",
		discoveryUrl: `https://login.microsoftonline.com/${options.tenantId}/v2.0/.well-known/openid-configuration`,
		requireClaims: { tid: options.tenantId }
	};
}

/** Google Workspace accounts of one domain. Roles: map the `hd` (domain) claim. */
export function googleWorkspace(options: { domain: string; label?: string }): SsoProvider {
	return {
		id: "google-workspace",
		label: options.label ?? "Google",
		discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
		requireClaims: { hd: options.domain }
	};
}

/** Okta. Roles: the `groups` claim, once a groups claim is added to the app's ID token. */
export function okta(options: { issuer: string; label?: string }): SsoProvider {
	return oidc({ id: "okta", label: options.label ?? "Okta", issuer: options.issuer });
}

/** Keycloak realm (issuer: https://host/realms/<realm>). Roles: `realm_access.roles`. */
export function keycloak(options: { issuer: string; label?: string }): SsoProvider {
	return oidc({ id: "keycloak", label: options.label ?? "Keycloak", issuer: options.issuer });
}

/** Any other OpenID Connect provider, by its issuer URL. */
export function oidc(options: {
	id: string;
	label: string;
	issuer: string;
	requireClaims?: Record<string, string>;
}): SsoProvider {
	return {
		id: options.id,
		label: options.label,
		discoveryUrl: `${options.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
		requireClaims: options.requireClaims
	};
}
