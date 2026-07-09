/**
 * Return an image URL suitable for rendering. No optimization pipeline is
 * wired up locally — the `width`/`quality` args are accepted for call-site
 * stability and will be re-used when R2 + a CDN/optimizer are added.
 */
export function imageUrl(source: string, _width: number, _quality = 75): string {
	return source;
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
