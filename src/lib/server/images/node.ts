/**
 * On-demand image resizing for the node target: sharp, with resized variants
 * cached on disk next to the uploads (data/uploads/.cache). Cache entries are
 * immutable because upload filenames contain a random id.
 */
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const CACHE_DIR = "data/uploads/.cache";

export async function resizeImage(
	path: string,
	original: Uint8Array,
	width: number,
	quality: number
): Promise<{ body: Uint8Array; contentType: string }> {
	const cachePath = join(CACHE_DIR, `w${width}q${quality}`, `${path}.webp`);

	if (existsSync(cachePath)) {
		return { body: await readFile(cachePath), contentType: "image/webp" };
	}

	const resized = await sharp(original)
		.resize({ width, withoutEnlargement: true })
		.webp({ quality })
		.toBuffer();

	await mkdir(dirname(cachePath), { recursive: true });
	await writeFile(cachePath, resized);

	return { body: resized, contentType: "image/webp" };
}
