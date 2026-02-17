/**
 * Generate a Vercel Image Optimization URL
 *
 * Uses /_vercel/image to resize and optimize images served from Vercel Blob.
 * Width-only resizing — aspect ratio is preserved automatically.
 */
export function imageUrl(source: string, width: number, quality = 75): string {
	return `/_vercel/image?url=${encodeURIComponent(source)}&w=${width}&q=${quality}`;
}
