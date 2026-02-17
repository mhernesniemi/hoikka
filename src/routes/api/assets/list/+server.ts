/**
 * List images from Vercel Blob storage
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { list } from "@vercel/blob";

export const GET: RequestHandler = async ({ url, locals }) => {
	// Only admins can list blob files
	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const prefix = url.searchParams.get("folder")?.replace(/^\//, "") || "products";

	try {
		const result = await list({ prefix: `${prefix}/` });
		const files = result.blobs.map((blob) => ({
			url: blob.url,
			name: blob.pathname.split("/").pop() ?? blob.pathname,
			size: blob.size,
			uploadedAt: blob.uploadedAt
		}));
		return json(files);
	} catch {
		return json({ error: "Failed to list files" }, { status: 500 });
	}
};
