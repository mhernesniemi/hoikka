import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { env } from "$env/dynamic/private";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

export const auth = betterAuth({
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
		})
	]
});

export type Auth = typeof auth;
