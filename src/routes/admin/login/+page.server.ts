import { redirect } from "@sveltejs/kit";
import * as env from "$app/env/private";
import { db } from "#lib/server/db/index.js";
import { user } from "#lib/server/db/schema.js";
import { enabledSsoProviders, staffPasswordLoginAllowed } from "#lib/server/sso.js";
import { STAFF_SSO } from "#lib/config/admin.js";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user && ["admin", "staff"].includes(locals.user.role ?? "")) {
		throw redirect(303, "/admin");
	}

	const admin = await db.query.user.findFirst({
		where: eq(user.role, "admin"),
		columns: { id: true }
	});
	const passwordLogin = staffPasswordLoginAllowed(STAFF_SSO, env);

	// With SSO only, the first admin is whoever signs in with the admin role
	if (!admin && passwordLogin) {
		throw redirect(303, "/admin/setup");
	}

	return {
		ssoProviders: enabledSsoProviders(STAFF_SSO, env).map(({ id, label }) => ({ id, label })),
		passwordLogin,
		ssoError: url.searchParams.get("error") === "sso"
	};
};
