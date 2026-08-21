import { redirect } from "@sveltejs/kit";
import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

export const load = async () => {
	throw redirect(303, "/admin/login");
};
