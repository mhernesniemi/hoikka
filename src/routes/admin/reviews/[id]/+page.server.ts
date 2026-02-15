import { reviewService } from "$lib/server/services/reviews.js";
import { productService } from "$lib/server/services/products.js";
import { customerService } from "$lib/server/services/customers.js";
import { dbError } from "$lib/server/db-error.js";
import { error, fail, redirect, isRedirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) {
		throw error(400, "Invalid review ID");
	}

	const review = await reviewService.getById(id);
	if (!review) {
		throw error(404, "Review not found");
	}

	const [product, customer] = await Promise.all([
		productService.getById(review.productId),
		customerService.getById(review.customerId)
	]);

	return { review, product, customer };
};

export const actions: Actions = {
	approve: async ({ params }) => {
		const id = Number(params.id);

		try {
			await reviewService.moderate(id, "approved");
			return { success: true, message: "Review approved" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to approve review") });
		}
	},

	reject: async ({ params }) => {
		const id = Number(params.id);

		try {
			await reviewService.moderate(id, "rejected");
			return { success: true, message: "Review rejected" };
		} catch (e) {
			return fail(500, { error: dbError(e, "Failed to reject review") });
		}
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		try {
			await reviewService.delete(id);
			throw redirect(303, "/admin/reviews");
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: dbError(err, "Failed to delete review") });
		}
	}
};
