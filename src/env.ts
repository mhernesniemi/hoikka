/**
 * Every environment variable the app reads, for $app/env/private and
 * $app/env/public. All are optional; see .env.example for what each does.
 * A variable that isn't declared here can't be read, so add your own (e.g.
 * WEBHOOK_SECRET_ERP for /api/webhooks/erp) to the list.
 */
import { defineEnvVars } from "@sveltejs/kit/env";
import * as v from "valibot";
import config from "../hoikka.config.js";
import { ssoEnvName } from "./lib/config-schema/index.js";

const optional = { schema: v.optional(v.string()) };
const optionalPublic = { ...optional, public: true };

// One set per provider in hoikka.config.ts admin.sso
const sso = Object.fromEntries(
	(config.admin.sso?.providers ?? []).flatMap((provider) =>
		(["CLIENT_ID", "CLIENT_SECRET", "DISCOVERY_URL"] as const).map((setting) => [
			ssoEnvName(provider.id, setting),
			optional
		])
	)
);

export const variables = defineEnvVars({
	HOIKKA_TARGET: optional,
	DEMO_MODE: optional,
	PUBLIC_SITE_URL: optionalPublic,
	PUBLIC_STORE_URL: optional,

	DATABASE_URL: optional,
	DATABASE_MUST_EXIST: optional,
	MIGRATIONS_DIR: optional,

	BETTER_AUTH_SECRET: optional,
	BETTER_AUTH_URL: optional,
	ADMIN_SETUP_SECRET: optional,
	ADMIN_PASSWORD_LOGIN: optional,
	GOOGLE_CLIENT_ID: optional,
	GOOGLE_CLIENT_SECRET: optional,
	...sso,

	RESEND_API_KEY: optional,
	RESEND_FROM_EMAIL: optional,

	STRIPE_SECRET_KEY: optional,
	STRIPE_WEBHOOK_SECRET: optional,
	STRIPE_MANUAL_CAPTURE: optional,
	PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalPublic,
	ENABLE_MOCK_PAYMENTS: optional,

	UPLOADS_DIR: optional,
	CACHE_DIR: optional,
	S3_BUCKET: optional,
	S3_ACCESS_KEY_ID: optional,
	S3_SECRET_ACCESS_KEY: optional,
	S3_ENDPOINT: optional,
	S3_REGION: optional,
	S3_PREFIX: optional,

	TASKS_SECRET: optional,
	SENTRY_DSN: optional,
	ORDER_WEBHOOK_URL: optional,
	ORDER_WEBHOOK_SECRET: optional
});
