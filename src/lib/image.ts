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

/**
 * Cloudflare Images silently falls back from AVIF to (much heavier) webp
 * above roughly 1.2 megapixels of output, so candidates are capped where a
 * 4:5 portrait still encodes as AVIF. A 960px AVIF beats a 1200px webp on
 * bytes by an order of magnitude, and high-density screens hide the
 * difference.
 */
const MAX_SRCSET_WIDTH = 960;

/** 1x/1.5x srcset for local uploads; undefined for external URLs. */
export function imageSrcset(source: string, width: number, quality = 80): string | undefined {
	if (!source.startsWith("/uploads/")) return undefined;
	// Width descriptors, not 1x/2x: browsers ignore `sizes` with density
	// descriptors, which forces phones to fetch the 2x file into half-width
	// slots. Density is capped at 1.5x — a full 2x roughly doubles the bytes
	// for a difference high-density rendering hides, and on slow links total
	// image bytes are the page load time. The 1.5x candidate also drops
	// quality, which density hides as well.
	const candidates: [number, number][] = [
		[width, quality],
		[Math.round(width * 1.5), Math.max(40, Math.round(quality * 0.8))]
	];
	const seen = new Set<number>();
	const parts = [];
	for (const [w, q] of candidates) {
		const capped = Math.min(w, MAX_SRCSET_WIDTH);
		if (seen.has(capped)) continue;
		seen.add(capped);
		parts.push(`${imageUrl(source, capped, q)} ${capped}w`);
	}
	return parts.join(", ");
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
