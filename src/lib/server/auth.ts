import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, genericOAuth } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { SIGN_UP_ENABLED } from "$lib/config/customers.js";
import { STAFF_SSO } from "$lib/config/admin.js";
import { sendEmail } from "./email.js";
import { customerService } from "./services/customers.js";
import {
	decodeIdToken,
	enabledSsoProviders,
	staffFromClaims,
	staffPasswordLoginAllowed
} from "./sso.js";

// Endpoints that email a code to an existing user
const CODE_REQUEST_PATHS = new Set([
	"/email-otp/send-verification-otp",
	"/email-otp/request-password-reset",
	"/forget-password/email-otp"
]);

const PASSWORD_SIGN_IN_PATHS = new Set(["/sign-in/email", "/sign-in/email-otp"]);

function createAuth() {
	const ssoProviders = enabledSsoProviders(STAFF_SSO, env);
	const staffPasswordLogin = staffPasswordLoginAllowed(STAFF_SSO, env);

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification
			}
		}),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			minPasswordLength: 8
		},
		socialProviders:
			env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
				? {
						google: {
							clientId: env.GOOGLE_CLIENT_ID,
							clientSecret: env.GOOGLE_CLIENT_SECRET,
							disableSignUp: !SIGN_UP_ENABLED
						}
					}
				: {},
		user: {
			additionalFields: {
				role: {
					type: "string",
					required: false,
					defaultValue: "customer",
					input: false
				}
			}
		},
		databaseHooks: {
			session: {
				create: {
					after: async (session) => {
						await db
							.update(schema.user)
							.set({ lastSignInAt: session.createdAt })
							.where(eq(schema.user.id, session.userId));
					}
				}
			}
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				const email = (ctx.body as { email?: unknown } | undefined)?.email;
				if (typeof email !== "string") return;

				// With staff SSO, the identity provider decides who is staff
				if (!staffPasswordLogin && PASSWORD_SIGN_IN_PATHS.has(ctx.path)) {
					const existing = await db.query.user.findFirst({
						where: eq(schema.user.email, email.toLowerCase()),
						columns: { role: true }
					});
					if (existing?.role === "admin" || existing?.role === "staff") {
						const labels = ssoProviders.map((provider) => provider.label).join(" or ");
						throw new APIError("FORBIDDEN", {
							message: `Staff sign in with ${labels}.`
						});
					}
				}

				// A customer created ahead of their login gets one when they ask for
				// a code, so "forgot password" doubles as "set your password"
				if (CODE_REQUEST_PATHS.has(ctx.path)) {
					try {
						await customerService.provisionLogin(email);
					} catch (error) {
						console.error("[auth] Failed to provision a customer login:", error);
					}
				}
			}),
			// better-auth never takes `role` from a provider (it is not user
			// input), so it is set here from the ID token the sign-in just stored.
			// Re-applied on every sign-in: a role removed at the provider is gone.
			after: createAuthMiddleware(async (ctx) => {
				const provider = ssoProviders.find((p) => p.id === ctx.params?.providerId);
				const userId = ctx.context.newSession?.user.id;
				if (!provider || !userId || !STAFF_SSO) return;
				const linked = await db.query.account.findFirst({
					where: and(
						eq(schema.account.userId, userId),
						eq(schema.account.providerId, provider.id)
					),
					columns: { idToken: true }
				});
				if (!linked?.idToken) return;
				const result = staffFromClaims(
					decodeIdToken(linked.idToken),
					provider,
					STAFF_SSO.roles
				);
				if (!result.ok) return;
				await db
					.update(schema.user)
					.set({ role: result.staff.role })
					.where(eq(schema.user.id, userId));
			})
		},
		plugins: [
			...(ssoProviders.length > 0
				? [
						genericOAuth({
							config: ssoProviders.map((provider) => ({
								providerId: provider.id,
								discoveryUrl: provider.discoveryUrl,
								clientId: provider.clientId,
								clientSecret: provider.clientSecret,
								scopes: ["openid", "profile", "email"],
								pkce: true,
								// Re-sync name and email from the provider on every sign-in
								overrideUserInfo: true,
								async getUserInfo(tokens) {
									if (!tokens.idToken || !STAFF_SSO) return null;
									const result = staffFromClaims(
										decodeIdToken(tokens.idToken),
										provider,
										STAFF_SSO.roles
									);
									if (!result.ok) {
										console.warn(
											`[sso] ${provider.id} sign-in refused: ${result.reason}`
										);
										return null;
									}
									const { staff } = result;
									return {
										id: staff.id,
										email: staff.email,
										name: staff.name,
										emailVerified: true
									};
								}
							}))
						})
					]
				: []),
			emailOTP({
				disableSignUp: !SIGN_UP_ENABLED,
				async sendVerificationOTP({ email, otp, type }) {
					const subjects: Record<typeof type, string> = {
						"sign-in": "Your sign-in code",
						"email-verification": "Verify your email address",
						"forget-password": "Your password reset code",
						"change-email": "Confirm your new email address"
					};
					const bodies: Record<typeof type, string> = {
						"sign-in": `Hi, your sign-in code is: <strong>${otp}</strong>. The code expires shortly — if you didn't try to sign in, you can ignore this message.`,
						"email-verification": `Hi, verify your email address with this code: <strong>${otp}</strong>. The code expires shortly — if you didn't create an account, you can ignore this message.`,
						"forget-password": `Hi, your password reset code is: <strong>${otp}</strong>. The code expires shortly — if you didn't request a reset, you can ignore this message.`,
						"change-email": `Hi, confirm your new email address with this code: <strong>${otp}</strong>. The code expires shortly — if you didn't request this change, you can ignore this message.`
					};
					const html = `<p>${bodies[type]}</p>`;
					let sent = false;
					try {
						({ sent } = await sendEmail(email, subjects[type], html));
					} catch (error) {
						console.error(`[auth] Failed to send OTP email (${type}):`, error);
					}
					// Keep local dev usable: surface the OTP in the console only when
					// no email actually went out (never log OTPs alongside a real
					// send). Codes are secrets — outside dev the failure is reported
					// without the code or the recipient.
					if (!sent) {
						if (dev) {
							console.log(`[auth] OTP for ${email} (${type}): ${otp}`);
						} else {
							console.error(`[auth] OTP delivery failed (${type}) — code not issued`);
						}
					}
				}
			}),
			// Forwards session cookies from server-side auth.api calls (e.g. the
			// first-run admin setup's signUpEmail) into the SvelteKit response, so
			// the user is signed in immediately after
			sveltekitCookies(getRequestEvent)
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;

// Lazily constructed on first use. Better Auth throws on a missing secret at
// construction time, so building it at module scope would break SvelteKit's
// build-time route analysis (where $env/dynamic/private is empty). The proxy
// defers construction to the first real request, when env vars are present.
let instance: Auth | null = null;

export const auth = new Proxy({} as Auth, {
	get(_target, prop) {
		instance ??= createAuth();
		const value = instance[prop as keyof Auth];
		return typeof value === "function" ? value.bind(instance) : value;
	}
});
