import { fail, redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import type { Actions, PageServerLoad } from "./$types";

async function hasAdminUser(): Promise<boolean> {
	try {
		const result = await db.execute<{ id: string }>(
			sql`SELECT id FROM neon_auth."user" WHERE role = 'admin' LIMIT 1`
		);
		return result.rows.length > 0;
	} catch {
		// neon_auth schema/table doesn't exist (Auth not enabled)
		return false;
	}
}

export const load: PageServerLoad = async () => {
	if (await hasAdminUser()) {
		throw redirect(303, "/admin/login");
	}
	return { authConfigured: !!env.NEON_AUTH_BASE_URL };
};

export const actions: Actions = {
	setup: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString().trim();
		const email = data.get("email")?.toString().trim().toLowerCase();
		const password = data.get("password")?.toString();

		if (!name || !email || !password) {
			return fail(400, { error: "All fields are required", name, email });
		}

		if (password.length < 8) {
			return fail(400, { error: "Password must be at least 8 characters", name, email });
		}

		// Race condition guard: re-check no admin exists
		if (await hasAdminUser()) {
			throw redirect(303, "/admin/login");
		}

		const baseUrl = env.NEON_AUTH_BASE_URL;
		if (!baseUrl) {
			return fail(500, { error: "Authentication is not configured", name, email });
		}

		try {
			const signUpRes = await fetch(`${baseUrl}/sign-up/email`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: baseUrl
				},
				body: JSON.stringify({ email, password, name })
			});

			const responseText = await signUpRes.text();

			if (!signUpRes.ok) {
				console.error("[setup] Sign-up failed:", signUpRes.status, responseText);
				return fail(400, {
					error: "Failed to create account. Please try again.",
					name,
					email
				});
			}

			const result = JSON.parse(responseText);
			const userId = result.user?.id;

			if (!userId) {
				console.error("[setup] No user ID in response:", responseText);
				return fail(500, {
					error: "Account created but could not complete setup",
					name,
					email
				});
			}

			await db.execute(
				sql`UPDATE neon_auth."user" SET role = 'admin', "emailVerified" = true WHERE id = ${userId}`
			);
		} catch (error) {
			console.error("[setup] Failed to create admin:", error);
			return fail(500, { error: "An unexpected error occurred", name, email });
		}

		throw redirect(303, "/admin/login");
	}
};
