import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

function createAuth() {
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
							clientSecret: env.GOOGLE_CLIENT_SECRET
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
		plugins: [
			emailOTP({
				async sendVerificationOTP({ email, otp, type }) {
					// TODO: wire Resend/SMTP here. Local dev logs to console.
					console.log(`[auth] OTP for ${email} (${type}): ${otp}`);
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
