/**
 * Image URL helpers. Local uploads are served by /uploads/[...path], which
 * resizes on demand (sharp on the node target, the Cloudflare Images binding
 * on the cloudflare target) — `width`/`quality` become `?w=&q=` params on
 * that route. External URLs pass through untouched.
 *
 * Prefer the <Img> component (storefront) over calling these directly — it
 * emits srcset/sizes and focal-point positioning for you.
 */
export function imageUrl(source: string, width?: number, quality = 80): string {
	if (!width || !source.startsWith("/uploads/")) return source;
	return `${source}?w=${width}&q=${quality}`;
}

/** 1x/2x srcset for local uploads; undefined for external URLs. */
export function imageSrcset(source: string, width: number, quality = 80): string | undefined {
	if (!source.startsWith("/uploads/")) return undefined;
	// Retina pixel density hides compression artifacts, so the 2x candidate
	// takes noticeably heavier compression at no visible cost — the 2x file
	// is the biggest download on the page, this roughly halves it
	const retinaQuality = Math.max(40, Math.round(quality * 0.75));
	return `${imageUrl(source, width, quality)} 1x, ${imageUrl(source, width * 2, retinaQuality)} 2x`;
}

/**
 * Generate a CSS object-position value from focal point coordinates (0–1).
 */
export function focalPosition(
	focalX: number | null | undefined,
	focalY: number | null | undefined
): string {
	return `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%`;
}
