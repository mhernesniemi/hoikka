/**
 * On-demand image resizing for the node target: sharp, with resized variants
 * cached on disk (data/uploads/.cache/<path>/w<w>q<q>.webp). Cache entries are
 * immutable because upload filenames contain a random id, so a hit never
 * reads the original from storage.
 */
import sharp from "sharp";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = "data/uploads/.cache";

/** The path comes from the request URL, so it must not climb out of the cache. */
function variantDir(path: string): string | null {
	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) return null;
	return join(CACHE_DIR, ...segments);
}

/**
 * Re-encode an uploaded master as webp capped at `maxWidth` (never enlarged).
 * EXIF orientation is baked in since webp drops the metadata.
 */
export async function optimizeMasterImage(
	original: Uint8Array,
	maxWidth: number,
	quality: number
): Promise<Uint8Array> {
	return new Uint8Array(
		await sharp(original)
			.rotate()
			.resize({ width: maxWidth, withoutEnlargement: true })
			.webp({ quality })
			.toBuffer()
	);
}

/** Returns null when the original doesn't exist. */
export async function resizeImage(
	path: string,
	width: number,
	quality: number,
	loadOriginal: () => Promise<Uint8Array | null>
): Promise<{ body: Uint8Array; contentType: string } | null> {
	const dir = variantDir(path);
	if (!dir) return null;
	const cachePath = join(dir, `w${width}q${quality}.webp`);

	if (existsSync(cachePath)) {
		return { body: await readFile(cachePath), contentType: "image/webp" };
	}

	const original = await loadOriginal();
	if (!original) return null;

	const resized = await sharp(original)
		.resize({ width, withoutEnlargement: true })
		.webp({ quality })
		.toBuffer();

	await mkdir(dir, { recursive: true });
	await writeFile(cachePath, resized);

	return { body: resized, contentType: "image/webp" };
}

export async function purgeResizedImages(path: string): Promise<void> {
	const dir = variantDir(path);
	if (dir) await rm(dir, { recursive: true, force: true });
}
