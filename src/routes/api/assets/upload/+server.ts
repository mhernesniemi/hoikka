/**
 * Asset upload endpoint — writes files to the active storage backend
 * (local fs on node, R2 on cloudflare). Large raster images are re-encoded
 * as webp masters capped at 2400px, so serving transforms never have to read
 * megabyte-class originals.
 *
 * `purpose=digital` uploads the deliverable file of a digital product
 * instead: a different (non-image) type allowlist, a much larger size cap, and
 * no re-encoding. Those files are only ever served through /downloads/<token>.
 *
 * Deliverables are streamed straight to storage from the raw request body —
 * never parsed as a form and never buffered. A Workers isolate has ~128 MB to
 * work with, so reading a large file into memory (twice, as formData() plus
 * arrayBuffer() would) kills the request long before the size cap is reached.
 */
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { upload, uploadStream } from "$lib/server/storage/index.js";
import { PRIVATE_PREFIX } from "$lib/server/storage/types.js";
import { capStream } from "$lib/server/http.js";
// $lib specifier so the cloudflare build can alias sharp away (vite.config.ts)
import { optimizeMasterImage } from "$lib/server/images/node.js";
import { env } from "$env/dynamic/private";
import config from "$hoikka/config";

const IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/avif"
]);

// Deliverables for digital products. Deliberately excludes anything the
// browser would execute if it were ever served inline.
const DIGITAL_TYPES = new Set([
	"application/pdf",
	"application/epub+zip",
	"application/zip",
	"audio/mpeg",
	"audio/wav",
	"video/mp4",
	"text/plain",
	"text/csv"
]);

const OPTIMIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MAX_IMAGE_BYTES = config.limits.upload.maxImageBytes;
// Streamed, so this is a policy limit rather than a memory one. The hard
// ceiling above it is the platform's request-body limit, which on Workers
// depends on the plan (100 MB free, higher on paid).
const MAX_DELIVERABLE_BYTES = config.limits.upload.maxDeliverableBytes;

/**
 * Stream a digital product's deliverable to storage. The body is the file
 * itself; its name and type travel as query parameters, so nothing has to be
 * parsed or buffered before the bytes start moving.
 */
async function uploadDeliverable(request: Request, url: URL) {
	const filename = url.searchParams.get("filename");
	const contentType = request.headers.get("content-type") ?? "";
	const contentLength = Number(request.headers.get("content-length") ?? 0);

	if (!filename) throw error(400, "Missing filename");
	if (!DIGITAL_TYPES.has(contentType)) {
		throw error(400, "File type not allowed. Use PDF, EPUB, ZIP, MP3, WAV, MP4, TXT or CSV.");
	}
	// The header is a cheap early reject; the cap that actually holds is applied
	// to the stream, since a client can declare any length it likes.
	if (!contentLength) throw error(411, "Content-Length is required");
	if (contentLength > MAX_DELIVERABLE_BYTES) {
		throw error(
			413,
			`File too large. Maximum size is ${MAX_DELIVERABLE_BYTES / (1024 * 1024)} MB.`
		);
	}
	if (!request.body) throw error(400, "No file provided");

	// Deliverables go to the private namespace, which /uploads refuses to serve
	let publicUrl: string;
	try {
		({ url: publicUrl } = await uploadStream(
			`${PRIVATE_PREFIX}/digital`,
			filename,
			capStream(request.body, MAX_DELIVERABLE_BYTES),
			{ contentType, contentLength }
		));
	} catch (err) {
		console.warn("[upload] deliverable_rejected", { error: (err as Error).message });
		throw error(
			413,
			`File too large. Maximum size is ${MAX_DELIVERABLE_BYTES / (1024 * 1024)} MB.`
		);
	}

	return json({
		url: publicUrl,
		name: filename,
		width: 0,
		height: 0,
		size: contentLength,
		mimeType: contentType
	});
}
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

export const POST: RequestHandler = async ({ request, url: requestUrl, locals, platform }) => {
	if (env.DEMO_MODE === "true") {
		throw error(403, "Uploads are disabled in demo mode.");
	}

	if (!locals.user || !["admin", "staff"].includes(locals.user.role ?? "")) {
		throw error(401, "Unauthorized");
	}

	if (requestUrl.searchParams.get("purpose") === "digital") {
		return uploadDeliverable(request, requestUrl);
	}

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const folder = (formData.get("folder") as string) ?? "products";

	if (!file) throw error(400, "No file provided");
	if (!IMAGE_TYPES.has(file.type)) {
		throw error(400, "File type not allowed. Use JPEG, PNG, GIF, WebP, SVG, or AVIF.");
	}
	if (file.size > MAX_IMAGE_BYTES) {
		throw error(413, `File too large. Maximum size is ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
	}

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

	return json({
		url,
		name: filename,
		width,
		height,
		size: bytes.byteLength,
		mimeType: file.type
	});
};
