import { redirect } from "@sveltejs/kit";
import { adminNav } from "#lib/admin-nav.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	throw redirect(303, adminNav[0].href);
};
