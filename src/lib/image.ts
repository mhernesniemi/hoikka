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
	return `${imageUrl(source, width, quality)} 1x, ${imageUrl(source, width * 2, quality)} 2x`;
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
