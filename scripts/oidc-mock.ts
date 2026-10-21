/**
 * A local OpenID Connect provider for trying staff SSO (admin.sso) without a
 * real tenant. It signs in one configured person immediately, with no login
 * screen, and puts their claims in the ID token.
 *
 *   pnpm oidc:mock
 *
 * then run the app with the provider's env pointed at it, e.g. for entraId():
 *
 *   SSO_ENTRA_CLIENT_ID=hoikka SSO_ENTRA_CLIENT_SECRET=mock \
 *   SSO_ENTRA_DISCOVERY_URL=http://localhost:8180/.well-known/openid-configuration pnpm dev
 *
 * Who signs in: OIDC_MOCK_EMAIL, OIDC_MOCK_NAME, and OIDC_MOCK_ROLES
 * (comma-separated values for the OIDC_MOCK_ROLES_CLAIM claim, default
 * "roles"; empty = no access). OIDC_MOCK_CLAIMS adds JSON claims that a
 * provider requires, e.g. '{"tid":"<tenant id>"}' for entraId().
 */
import { OAuth2Server, Events } from "oauth2-mock-server";

const port = Number(process.env.OIDC_MOCK_PORT ?? 8180);
const email = process.env.OIDC_MOCK_EMAIL ?? "admin@example.com";
const name = process.env.OIDC_MOCK_NAME ?? "Mock Admin";
const rolesClaim = process.env.OIDC_MOCK_ROLES_CLAIM ?? "roles";
const roles = (process.env.OIDC_MOCK_ROLES ?? "").split(",").filter(Boolean);
const extraClaims = JSON.parse(process.env.OIDC_MOCK_CLAIMS ?? "{}") as Record<string, unknown>;

const server = new OAuth2Server();
await server.issuer.keys.generate("RS256");

server.service.on(Events.BeforeTokenSigning, (token) => {
	Object.assign(token.payload, {
		sub: `mock-${email}`,
		email,
		preferred_username: email,
		name,
		[rolesClaim]: roles,
		...extraClaims
	});
});

await server.start(port, "localhost");
console.log(
	`[oidc-mock] ${server.issuer.url} signs in ${email} (${rolesClaim}: ${roles.join(", ") || "none"})`
);
