/**
 * First-run admin bootstrap.
 *
 * The route is only reachable while the store has no admin user, but "no admin
 * yet" is exactly the window an attacker races on a fresh deployment. Outside
 * development the form therefore also requires ADMIN_SETUP_SECRET: when the
 * variable is unset the route stays closed entirely.
 */
import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, sql } from "drizzle-orm";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { auth } from "@hoikka/core/server/auth";
import { db } from "@hoikka/core/server/db/index";
import { user } from "@hoikka/core/server/db/schema";
import { secretMatches } from "@hoikka/core/server/secrets";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

async function hasAdminUser(): Promise<boolean> {
	const admin = await db.query.user.findFirst({
		where: eq(user.role, "admin"),
		columns: { id: true }
	});
	return !!admin;
}

/** Whether first-run setup may be used at all on this deployment. */
function setupEnabled(): boolean {
	return dev || !!env.ADMIN_SETUP_SECRET;
}

export const load = async () => {
	if (await hasAdminUser()) {
		redirect(303, "/admin/login");
	}
	if (!setupEnabled()) {
		error(404, "First-run setup is disabled. Set ADMIN_SETUP_SECRET to enable it.");
	}
	return { authConfigured: true, requiresSecret: !!env.ADMIN_SETUP_SECRET };
};

export const actions = {
	setup: async ({ request }: RequestEvent) => {
		if (!setupEnabled()) {
			error(404, "First-run setup is disabled");
		}

		const data = await request.formData();
		const name = data.get("name")?.toString().trim();
		const email = data.get("email")?.toString().trim().toLowerCase();
		const password = data.get("password")?.toString();
		const setupSecret = data.get("setupSecret")?.toString() ?? "";

		const expectedSecret = env.ADMIN_SETUP_SECRET;
		if (expectedSecret && !secretMatches(setupSecret, expectedSecret)) {
			console.warn("[setup] rejected — bad setup secret");
			return fail(403, { error: "Invalid setup secret", name, email });
		}

		if (!name || !email || !password) {
			return fail(400, { error: "All fields are required", name, email });
		}

		if (password.length < 8) {
			return fail(400, { error: "Password must be at least 8 characters", name, email });
		}

		if (await hasAdminUser()) {
			redirect(303, "/admin/login");
		}

		let userId: string;
		try {
			const result = await auth.api.signUpEmail({
				body: { email, password, name }
			});
			userId = result.user.id;
		} catch (err) {
			console.error("[setup] Sign-up failed:", err);
			return fail(400, { error: "Failed to create account. Please try again.", name, email });
		}

		// Promote only while there is still no admin. The NOT EXISTS runs inside
		// the UPDATE, so two concurrent setups can't both win the role.
		const promoted = await db
			.update(user)
			.set({ role: "admin", emailVerified: true })
			.where(
				and(
					eq(user.id, userId),
					sql`NOT EXISTS (SELECT 1 FROM "user" AS existing WHERE existing.role = 'admin')`
				)
			)
			.returning({ id: user.id });

		if (promoted.length === 0) {
			console.warn("[setup] promotion lost the race — an admin already exists");
			return fail(409, {
				error: "An administrator already exists. Sign in instead.",
				name,
				email
			});
		}

		redirect(303, "/admin");
	}
};
