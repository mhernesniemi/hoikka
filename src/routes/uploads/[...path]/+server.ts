/**
 * Serves uploaded assets from the active storage backend (local fs, S3 or R2) and
 * resizes them on demand via `?w=<width>&q=<quality>` — sharp on the node
 * target, the Cloudflare Images binding on the cloudflare target (falling
 * back to the original when the binding isn't configured). `/uploads/...`
 * URLs work identically on both deployment targets.
 *
 * Filenames contain a random id, so responses are safely immutable; on
 * Cloudflare, transformed variants are stored in the edge cache and persisted
 * to R2 (under `_variants/`), so only the first request for a variant
 * anywhere pays for reading the full-size original and transforming it.
 */
import { error } from "@sveltejs/kit";
import { get } from "#lib/server/storage/index.js";
import { VARIANT_PREFIX, contentTypeFor, isPrivatePath } from "#lib/server/storage/types.js";
// #lib specifiers so each build can swap the other target's module (vite.config.ts)
import { resizeImage } from "#lib/server/images/node.js";
import { bindings, defaultCache, waitUntil } from "#lib/server/cloudflare.js";
import type { RequestHandler } from "./$types.js";

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const CACHE_HEADERS = { "cache-control": "public, max-age=31536000, immutable" };

function clamp(value: string | null, min: number, max: number, fallback: number): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

export const GET: RequestHandler = async ({ params, url, request }) => {
	// Digital deliverables live in the bucket too, but this route must never
	// hand one out — `/downloads/<token>` is their only door.
	if (isPrivatePath(params.path)) error(404, "Not found");

	// Stored variants are already transformed — never transform them again
	const transformable = !params.path.startsWith(`${VARIANT_PREFIX}/`);
	const width = transformable ? clamp(url.searchParams.get("w"), 16, 2400, 0) : 0;
	const quality = clamp(url.searchParams.get("q"), 30, 95, 80);

	// AVIF beats webp substantially, especially for illustration-style art.
	// Negotiated via Accept, so format is part of every cache identity below.
	const wantsAvif = request.headers.get("accept")?.includes("image/avif") ?? false;
	const format = wantsAvif ? "avif" : "webp";

	// On Cloudflare, answer transformed variants from the edge cache when possible
	const edgeCache = defaultCache();
	const edgeKey = `${url.origin}${url.pathname}${url.search}&__f=${format}`;
	if (width && edgeCache) {
		const cached = await edgeCache.match(edgeKey);
		if (cached) return cached;
	}

	const bucket = bindings?.ASSETS_BUCKET;
	const images = bindings?.IMAGES;
	const variantKey = `${VARIANT_PREFIX}/${params.path}/w${width}q${quality}.${format}`;

	let response: Response | undefined;

	// Variant persisted in R2: a small read replaces the original fetch + transform
	if (width && bucket && images) {
		const stored = await bucket.get(variantKey);
		if (stored) {
			response = new Response(stored.body as unknown as BodyInit, {
				headers: {
					"content-type": `image/${format}`,
					"content-length": String(stored.size),
					vary: "accept",
					...CACHE_HEADERS
				}
			});
		}
	}

	// Node target: sharp with a disk cache, checked before the original is fetched
	if (width && !bindings && RESIZABLE.has(contentTypeFor(params.path))) {
		const resized = await resizeImage(params.path, width, quality, async () => {
			const file = await get(params.path);
			return file ? new Uint8Array(await new Response(file.body).arrayBuffer()) : null;
		});
		if (!resized) error(404, "Not found");
		response = new Response(resized.body as BodyInit, {
			headers: {
				"content-type": resized.contentType,
				"content-length": String(resized.body.byteLength),
				...CACHE_HEADERS
			}
		});
	}

	if (!response) {
		const file = await get(params.path);
		if (!file) throw error(404, "Not found");

		if (!width || !RESIZABLE.has(file.contentType)) {
			response = new Response(file.body, {
				headers: {
					"content-type": file.contentType,
					"content-length": String(file.size),
					...CACHE_HEADERS
				}
			});
		} else if (images) {
			// Cloudflare Images binding (workers-types streams are structurally
			// identical to DOM streams — the casts only bridge the two type worlds)
			const body = (file.body instanceof ReadableStream
				? file.body
				: new Response(file.body).body!) as unknown as Parameters<typeof images.input>[0];
			const result = await images
				.input(body)
				.transform({ width })
				.output({ format: format === "avif" ? "image/avif" : "image/webp", quality });
			// Buffered (variants are small) so the bytes can also be persisted to R2
			const image = await new Response(result.image() as unknown as BodyInit).arrayBuffer();
			response = new Response(image, {
				headers: {
					"content-type": result.contentType(),
					"content-length": String(image.byteLength),
					vary: "accept",
					...CACHE_HEADERS
				}
			});
			if (bucket) {
				waitUntil(
					bucket.put(variantKey, image, {
						httpMetadata: { contentType: result.contentType() }
					})
				);
			}
		} else {
			// No Images binding on Cloudflare — serve the original untransformed
			response = new Response(file.body, {
				headers: { "content-type": file.contentType, ...CACHE_HEADERS }
			});
		}
	}

	if (width && edgeCache && response.status === 200) {
		waitUntil(edgeCache.put(edgeKey, response.clone()));
	}

	return response;
};
