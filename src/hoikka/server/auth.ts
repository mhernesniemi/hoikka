import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { sendEmail } from "./email.js";

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
