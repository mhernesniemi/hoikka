/**
 * Serves uploaded assets from the active storage backend (local fs or R2) and
 * resizes them on demand via `?w=<width>&q=<quality>` — sharp on the node
 * target, the Cloudflare Images binding on the cloudflare target (falling
 * back to the original when the binding isn't configured). `/uploads/...`
 * URLs work identically on both deployment targets.
 *
 * Filenames contain a random id, so responses are safely immutable; on
 * Cloudflare, transformed variants are also stored in the edge cache.
 */
import { error } from "@sveltejs/kit";
import { get } from "$lib/server/storage/index.js";
// $lib specifier so the cloudflare build can alias sharp away (vite.config.ts)
import { resizeImage } from "$lib/server/images/node.js";
import type { RequestHandler } from "./$types.js";

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const CACHE_HEADERS = { "cache-control": "public, max-age=31536000, immutable" };

function clamp(value: string | null, min: number, max: number, fallback: number): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

export const GET: RequestHandler = async ({ params, url, request, platform }) => {
	const width = clamp(url.searchParams.get("w"), 16, 2400, 0);
	const quality = clamp(url.searchParams.get("q"), 30, 95, 80);

	// On Cloudflare, answer transformed variants from the edge cache when possible
	const edgeCache = platform?.caches?.default;
	if (width && edgeCache) {
		const cached = await edgeCache.match(request.url);
		if (cached) return cached;
	}

	const file = await get(params.path);
	if (!file) throw error(404, "Not found");

	let response: Response;

	if (!width || !RESIZABLE.has(file.contentType)) {
		response = new Response(file.body, {
			headers: {
				"content-type": file.contentType,
				"content-length": String(file.size),
				...CACHE_HEADERS
			}
		});
	} else if (platform?.env?.IMAGES) {
		// Cloudflare Images binding (workers-types streams are structurally
		// identical to DOM streams — the casts only bridge the two type worlds)
		const body = (file.body instanceof ReadableStream
			? file.body
			: new Response(file.body).body!) as unknown as Parameters<
			typeof platform.env.IMAGES.input
		>[0];
		const result = await platform.env.IMAGES.input(body)
			.transform({ width })
			.output({ format: "image/webp", quality });
		response = new Response(result.image() as unknown as BodyInit, {
			headers: { "content-type": result.contentType(), ...CACHE_HEADERS }
		});
	} else if (platform?.env) {
		// Cloudflare without an Images binding — serve the original untransformed
		response = new Response(file.body, {
			headers: { "content-type": file.contentType, ...CACHE_HEADERS }
		});
	} else {
		// Node target: sharp with a disk cache
		const original =
			file.body instanceof Uint8Array
				? file.body
				: new Uint8Array(await new Response(file.body).arrayBuffer());
		const resized = await resizeImage(params.path, original, width, quality);
		response = new Response(resized.body as BodyInit, {
			headers: {
				"content-type": resized.contentType,
				"content-length": String(resized.body.byteLength),
				...CACHE_HEADERS
			}
		});
	}

	if (width && edgeCache && response.status === 200) {
		platform?.ctx?.waitUntil(edgeCache.put(request.url, response.clone()));
	}

	return response;
};
