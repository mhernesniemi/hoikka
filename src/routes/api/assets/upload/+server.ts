/**
 * Vercel Blob upload endpoint
 *
 * Accepts multipart file uploads directly (not using the client upload token flow)
 * because the admin panel uploads from the browser to our own server, then we put to Blob.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { put } from "@vercel/blob";

export const POST: RequestHandler = async ({ request, locals }) => {
	// Only admins can upload
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const folder = (formData.get("folder") as string) ?? "products";

	if (!file) {
		throw error(400, "No file provided");
	}

	const blob = await put(`${folder}/${file.name}`, file, {
		access: "public",
		addRandomSuffix: true
	});

	// Get image dimensions if possible (the client will send them)
	const width = Number(formData.get("width")) || 0;
	const height = Number(formData.get("height")) || 0;

	return json({
		url: blob.url,
		name: file.name,
		width,
		height,
		size: file.size
	});
};
