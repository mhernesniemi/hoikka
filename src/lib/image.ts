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
