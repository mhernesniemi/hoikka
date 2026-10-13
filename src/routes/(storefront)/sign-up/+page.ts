import { error } from "@sveltejs/kit";
import { SIGN_UP_ENABLED } from "$lib/config/customers.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
	if (!SIGN_UP_ENABLED) error(404, "Not found");
};
