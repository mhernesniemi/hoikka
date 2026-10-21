/**
 * Staff sign-in through an identity provider (admin.sso in hoikka.config.ts),
 * on better-auth's genericOAuth plugin over OpenID Connect.
 *
 * A provider is on once its SSO_<ID>_CLIENT_ID and SSO_<ID>_CLIENT_SECRET are
 * set. Who may sign in, and as what, comes from the ID token on every sign-in:
 * the required claims must match, and the roles claim must map to a Hoikka
 * role. Customers are not affected; they keep their own sign-in.
 */
import type { SsoProvider, StaffRole, StaffSsoConfig } from "$lib/config-schema/types.js";

type Env = Record<string, string | undefined>;

export interface EnabledSsoProvider extends SsoProvider {
	clientId: string;
	clientSecret: string;
}

function envName(id: string, suffix: string): string {
	return `SSO_${id.toUpperCase().replace(/-/g, "_")}_${suffix}`;
}

export function enabledSsoProviders(sso: StaffSsoConfig | null, env: Env): EnabledSsoProvider[] {
	if (!sso) return [];
	return sso.providers.flatMap((provider) => {
		const clientId = env[envName(provider.id, "CLIENT_ID")];
		const clientSecret = env[envName(provider.id, "CLIENT_SECRET")];
		if (!clientId || !clientSecret) return [];
		return [
			{
				...provider,
				discoveryUrl: env[envName(provider.id, "DISCOVERY_URL")] || provider.discoveryUrl,
				clientId,
				clientSecret
			}
		];
	});
}

/** Whether staff may use the email/password form (always, without SSO). */
export function staffPasswordLoginAllowed(
	sso: (StaffSsoConfig & { passwordLogin: boolean }) | null,
	env: Env
): boolean {
	if (enabledSsoProviders(sso, env).length === 0) return true;
	return sso!.passwordLogin || env.ADMIN_PASSWORD_LOGIN === "true";
}

export type IdTokenClaims = Record<string, unknown>;

/**
 * The ID token arrives straight from the token endpoint over TLS in exchange
 * for the client secret, so OIDC lets the client trust it without verifying
 * the signature; audience and required claims are still checked.
 */
export function decodeIdToken(idToken: string): IdTokenClaims {
	const payload = idToken.split(".")[1];
	if (!payload) throw new Error("Malformed ID token");
	const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes)) as IdTokenClaims;
}

function claimAt(claims: IdTokenClaims, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(value, key) =>
				value && typeof value === "object"
					? (value as Record<string, unknown>)[key]
					: undefined,
			claims
		);
}

export function roleFromClaims(
	claims: IdTokenClaims,
	roles: StaffSsoConfig["roles"]
): StaffRole | null {
	const raw = claimAt(claims, roles.claim);
	const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
	const mapped = values.map((value) => roles.map[String(value)]);
	if (mapped.includes("admin")) return "admin";
	return mapped.includes("staff") ? "staff" : null;
}

export interface SsoStaff {
	id: string;
	email: string;
	name: string;
	role: StaffRole;
}

/** The staff member an ID token describes, or the reason they may not sign in. */
export function staffFromClaims(
	claims: IdTokenClaims,
	provider: EnabledSsoProvider,
	roles: StaffSsoConfig["roles"]
): { ok: true; staff: SsoStaff } | { ok: false; reason: string } {
	const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (!audiences.includes(provider.clientId)) return { ok: false, reason: "wrong audience" };
	for (const [claim, expected] of Object.entries(provider.requireClaims ?? {})) {
		if (claims[claim] !== expected) return { ok: false, reason: `${claim} does not match` };
	}
	const email = String(claims.email ?? claims.preferred_username ?? "").toLowerCase();
	if (typeof claims.sub !== "string" || !email)
		return { ok: false, reason: "missing sub or email" };
	const role = roleFromClaims(claims, roles);
	if (!role) return { ok: false, reason: "no mapped role" };
	const name = typeof claims.name === "string" && claims.name ? claims.name : email;
	return { ok: true, staff: { id: claims.sub, email, name, role } };
}
