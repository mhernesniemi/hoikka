/**
 * Asset upload endpoint — writes files to the active storage backend
 * (local fs on node, R2 on cloudflare).
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { upload } from "$lib/server/storage/index.js";
import { env } from "$env/dynamic/private";

export const POST: RequestHandler = async ({ request, locals }) => {
	if (env.DEMO_MODE === "true") {
		throw error(403, "Uploads are disabled in demo mode.");
	}

	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	const MAX_SIZE = 10 * 1024 * 1024;
	const ALLOWED_TYPES = new Set([
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/svg+xml",
		"image/avif"
	]);

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const folder = (formData.get("folder") as string) ?? "products";

	if (!file) throw error(400, "No file provided");
	if (!ALLOWED_TYPES.has(file.type)) {
		throw error(400, "File type not allowed. Use JPEG, PNG, GIF, WebP, SVG, or AVIF.");
	}
	if (file.size > MAX_SIZE) throw error(413, "File too large. Maximum size is 10 MB.");

	const bytes = new Uint8Array(await file.arrayBuffer());
	const { url } = await upload(folder, file.name, bytes);

	const width = Number(formData.get("width")) || 0;
	const height = Number(formData.get("height")) || 0;

	return json({ url, name: file.name, width, height, size: file.size });
};
