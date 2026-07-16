/**
 * Asset upload endpoint — writes files to the active storage backend
 * (local fs on node, R2 on cloudflare). Large raster images are re-encoded
 * as webp masters capped at 2400px, so serving transforms never have to read
 * megabyte-class originals.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { upload } from "$lib/server/storage/index.js";
// $lib specifier so the cloudflare build can alias sharp away (vite.config.ts)
import { optimizeMasterImage } from "$lib/server/images/node.js";
import { env } from "$env/dynamic/private";

const OPTIMIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OPTIMIZE_MIN_BYTES = 200 * 1024; // leave small files (icons, graphics) untouched
const MAX_MASTER_WIDTH = 2400;
const MASTER_QUALITY = 85;

async function optimizeMaster(
	bytes: Uint8Array,
	images: NonNullable<App.Platform["env"]>["IMAGES"]
): Promise<Uint8Array | null> {
	try {
		if (images) {
			const body = new Response(bytes as unknown as BodyInit).body! as unknown as Parameters<
				typeof images.input
			>[0];
			const result = await images
				.input(body)
				.transform({ width: MAX_MASTER_WIDTH, fit: "scale-down" })
				.output({ format: "image/webp", quality: MASTER_QUALITY });
			return new Uint8Array(
				await new Response(result.image() as unknown as BodyInit).arrayBuffer()
			);
		}
		return await optimizeMasterImage(bytes, MAX_MASTER_WIDTH, MASTER_QUALITY);
	} catch {
		// Optimization is best-effort — store the original on any failure
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
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

	let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
	let filename = file.name;
	let width = Number(formData.get("width")) || 0;
	let height = Number(formData.get("height")) || 0;

	if (OPTIMIZABLE_TYPES.has(file.type) && bytes.byteLength >= OPTIMIZE_MIN_BYTES) {
		const optimized = await optimizeMaster(bytes, platform?.env?.IMAGES);
		if (optimized && optimized.byteLength < bytes.byteLength) {
			bytes = optimized;
			filename = filename.replace(/\.\w+$/, "") + ".webp";
			if (width > MAX_MASTER_WIDTH) {
				height = Math.round((height * MAX_MASTER_WIDTH) / width) || 0;
				width = MAX_MASTER_WIDTH;
			}
		}
	}

	const { url } = await upload(folder, filename, bytes);

	return json({ url, name: filename, width, height, size: bytes.byteLength });
};
