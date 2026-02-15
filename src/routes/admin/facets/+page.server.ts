import { facetService } from "$lib/server/services/facets.js";
import { dbError } from "$lib/server/db-error.js";
import { fail, redirect, isRedirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const facets = await facetService.list();

	return { facets };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const code = formData.get("code") as string;
		const nameEn = formData.get("name_en") as string;

		if (!code || !nameEn) {
			return fail(400, { error: "Code and name are required" });
		}

		try {
			const facet = await facetService.create({
				code: code.toLowerCase().replace(/\s+/g, "_"),
				name: nameEn
			});

			throw redirect(303, `/admin/facets/${facet.id}?created`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to create facet") });
		}
	},

	deleteSelected: async ({ request }) => {
		const formData = await request.formData();
		const ids = formData.getAll("ids").map(Number).filter(Boolean);

		if (ids.length === 0) {
			return fail(400, { error: "No facets selected" });
		}

		try {
			await Promise.all(ids.map((id) => facetService.delete(id)));
			return { success: true };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to delete facets") });
		}
	}
};
