import { dev } from "$app/environment";

/**
 * Generate an image URL with optional Vercel Image Optimization
 *
 * In production, uses /_vercel/image to resize and optimize images served from Vercel Blob.
 * In dev, returns the raw source URL since /_vercel/image is not available locally.
 */
export function imageUrl(source: string, width: number, quality = 75): string {
	if (dev) return source;
	return `/_vercel/image?url=${encodeURIComponent(source)}&w=${width}&q=${quality}`;
}

/**
 * Generate a CSS object-position value from focal point coordinates.
 * Focal point values are 0–1 (stored as strings from numeric DB columns).
 */
export function focalPosition(
	focalX: string | number | null | undefined,
	focalY: string | number | null | undefined
): string {
	return `${Number(focalX ?? 0.5) * 100}% ${Number(focalY ?? 0.5) * 100}%`;
}
