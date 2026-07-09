import { fail, redirect } from "@sveltejs/kit";
import { auth } from "$lib/server/auth.js";
import { db } from "$lib/server/db/index.js";
import { user } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";

async function hasAdminUser(): Promise<boolean> {
	const admin = await db.query.user.findFirst({
		where: eq(user.role, "admin"),
		columns: { id: true }
	});
	return !!admin;
}

export const load: PageServerLoad = async () => {
	if (await hasAdminUser()) {
		throw redirect(303, "/admin/login");
	}
	return { authConfigured: true };
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

		if (await hasAdminUser()) {
			throw redirect(303, "/admin/login");
		}

		let userId: string;
		try {
			const result = await auth.api.signUpEmail({
				body: { email, password, name }
			});
			userId = result.user.id;
		} catch (error) {
			console.error("[setup] Sign-up failed:", error);
			return fail(400, { error: "Failed to create account. Please try again.", name, email });
		}

		try {
			await db
				.update(user)
				.set({ role: "admin", emailVerified: true })
				.where(eq(user.id, userId));
		} catch (error) {
			console.error("[setup] Failed to promote admin role:", error);
			return fail(500, { error: "Account created but role assignment failed", name, email });
		}

		throw redirect(303, "/admin");
	}
};
