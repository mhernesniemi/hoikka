import { error } from "@sveltejs/kit";

export const load = () => {
	throw error(404, "Not found");
};
