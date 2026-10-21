import { describe, expect, it } from "vitest";
import { entraId, keycloak } from "$lib/config-schema/providers.js";
import type { StaffSsoConfig } from "$lib/config-schema/types.js";
import {
	decodeIdToken,
	enabledSsoProviders,
	roleFromClaims,
	staffFromClaims,
	staffPasswordLoginAllowed,
	type IdTokenClaims
} from "./sso.js";

const sso: StaffSsoConfig & { passwordLogin: boolean } = {
	providers: [entraId({ tenantId: "tenant-1" }), keycloak({ issuer: "https://kc/realms/x/" })],
	roles: { claim: "roles", map: { "Shop.Admin": "admin", "Shop.Staff": "staff" } },
	passwordLogin: false
};
const env = { SSO_ENTRA_CLIENT_ID: "client-1", SSO_ENTRA_CLIENT_SECRET: "secret" };
const [entra] = enabledSsoProviders(sso, env);

const claims = (overrides: IdTokenClaims = {}): IdTokenClaims => ({
	tid: "tenant-1",
	aud: "client-1",
	sub: "sub-1",
	email: "Anna@Example.com",
	name: "Anna",
	roles: ["Shop.Staff"],
	...overrides
});

describe("enabledSsoProviders", () => {
	it("turns a provider on only once its client id and secret are set", () => {
		expect(enabledSsoProviders(sso, env).map((p) => p.id)).toEqual(["entra"]);
		expect(enabledSsoProviders(sso, { SSO_ENTRA_CLIENT_ID: "c" })).toEqual([]);
		expect(enabledSsoProviders(null, env)).toEqual([]);
	});

	it("builds env names from the id and takes a discovery override", () => {
		const google = { id: "google-workspace", label: "Google", discoveryUrl: "https://g" };
		const [provider] = enabledSsoProviders(
			{ ...sso, providers: [google] },
			{
				SSO_GOOGLE_WORKSPACE_CLIENT_ID: "c",
				SSO_GOOGLE_WORKSPACE_CLIENT_SECRET: "s",
				SSO_GOOGLE_WORKSPACE_DISCOVERY_URL:
					"http://localhost:8180/.well-known/openid-configuration"
			}
		);
		expect(provider.discoveryUrl).toBe(
			"http://localhost:8180/.well-known/openid-configuration"
		);
	});

	it("points Entra at the tenant's discovery document", () => {
		expect(entra.discoveryUrl).toBe(
			"https://login.microsoftonline.com/tenant-1/v2.0/.well-known/openid-configuration"
		);
		expect(sso.providers[1].discoveryUrl).toBe(
			"https://kc/realms/x/.well-known/openid-configuration"
		);
	});
});

describe("staffPasswordLoginAllowed", () => {
	it("is always allowed without an enabled provider", () => {
		expect(staffPasswordLoginAllowed(null, {})).toBe(true);
		expect(staffPasswordLoginAllowed(sso, {})).toBe(true);
	});

	it("is closed with SSO unless config or ADMIN_PASSWORD_LOGIN opens it", () => {
		expect(staffPasswordLoginAllowed(sso, env)).toBe(false);
		expect(staffPasswordLoginAllowed({ ...sso, passwordLogin: true }, env)).toBe(true);
		expect(staffPasswordLoginAllowed(sso, { ...env, ADMIN_PASSWORD_LOGIN: "true" })).toBe(true);
	});
});

describe("roleFromClaims", () => {
	it("takes the highest mapped role", () => {
		expect(roleFromClaims(claims({ roles: ["Shop.Staff", "Shop.Admin"] }), sso.roles)).toBe(
			"admin"
		);
		expect(roleFromClaims(claims({ roles: ["Other"] }), sso.roles)).toBeNull();
		expect(roleFromClaims(claims({ roles: undefined }), sso.roles)).toBeNull();
	});

	it("reads nested claims and single values", () => {
		const nested = { claim: "realm_access.roles", map: { shop_admin: "admin" as const } };
		expect(roleFromClaims({ realm_access: { roles: ["shop_admin"] } }, nested)).toBe("admin");
		const domain = { claim: "hd", map: { "example.com": "staff" as const } };
		expect(roleFromClaims({ hd: "example.com" }, domain)).toBe("staff");
	});
});

describe("staffFromClaims", () => {
	it("accepts a mapped person from the right tenant", () => {
		expect(staffFromClaims(claims(), entra, sso.roles)).toEqual({
			ok: true,
			staff: { id: "sub-1", email: "anna@example.com", name: "Anna", role: "staff" }
		});
	});

	it("refuses another tenant, another app, or no role", () => {
		expect(staffFromClaims(claims({ tid: "other" }), entra, sso.roles)).toMatchObject({
			ok: false,
			reason: "tid does not match"
		});
		expect(staffFromClaims(claims({ aud: "other-app" }), entra, sso.roles).ok).toBe(false);
		expect(staffFromClaims(claims({ roles: [] }), entra, sso.roles).ok).toBe(false);
	});

	it("falls back to preferred_username for the email", () => {
		const result = staffFromClaims(
			claims({ email: undefined, preferred_username: "B@Example.com" }),
			entra,
			sso.roles
		);
		expect(result.ok && result.staff.email).toBe("b@example.com");
	});
});

describe("decodeIdToken", () => {
	it("reads the payload of a JWT, including non-ASCII names", () => {
		const payload = Buffer.from(JSON.stringify({ name: "Äijä", roles: ["x"] })).toString(
			"base64url"
		);
		expect(decodeIdToken(`header.${payload}.signature`)).toEqual({
			name: "Äijä",
			roles: ["x"]
		});
		expect(() => decodeIdToken("nonsense")).toThrow();
	});
});
