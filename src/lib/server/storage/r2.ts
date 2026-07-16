/**
 * Cloudflare R2 storage backend. Object keys mirror the fs layout
 * (`<folder>/<filename>`), so public URLs are identical on both targets.
 */
import { getRequestEvent } from "$app/server";
import {
	PUBLIC_PREFIX,
	contentTypeFor,
	randomId,
	VARIANT_PREFIX,
	sanitizeFolder,
	type StorageBackend
} from "./types.js";

function bucket() {
	const bucket = getRequestEvent().platform?.env?.ASSETS_BUCKET;
	if (!bucket) throw new Error("R2 bucket binding ASSETS_BUCKET is not available");
	return bucket;
}

export const r2Storage: StorageBackend = {
	async upload(folder, filename, body) {
		const safeFolder = sanitizeFolder(folder);
		const dot = filename.lastIndexOf(".");
		const ext = dot === -1 ? "" : filename.slice(dot);
		const stem = dot === -1 ? filename : filename.slice(0, dot);
		const safeName = `${stem.split("/").pop()}-${randomId()}${ext}`;
		const key = `${safeFolder}/${safeName}`;

		await bucket().put(key, body, {
			httpMetadata: { contentType: contentTypeFor(safeName) }
		});

		return { url: `${PUBLIC_PREFIX}/${key}`, pathname: key };
	},

	async list(folder) {
		const safeFolder = sanitizeFolder(folder);
		const result = await bucket().list({ prefix: `${safeFolder}/` });
		return result.objects
			.map((obj) => ({
				url: `${PUBLIC_PREFIX}/${obj.key}`,
				name: obj.key.slice(safeFolder.length + 1),
				size: obj.size,
				uploadedAt: new Date(obj.uploaded)
			}))
			.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
	},

	async remove(url) {
		if (!url.startsWith(PUBLIC_PREFIX + "/")) return;
		const key = url.slice(PUBLIC_PREFIX.length + 1);
		const b = bucket();
		await b.delete(key);
		// Drop any persisted resized variants of the object as well
		const variants = await b.list({ prefix: `${VARIANT_PREFIX}/${key}/` });
		if (variants.objects.length > 0) {
			await b.delete(variants.objects.map((obj) => obj.key));
		}
	},

	async get(path) {
		const obj = await bucket().get(path);
		if (!obj) return null;
		return {
			body: obj.body as unknown as BodyInit,
			contentType: obj.httpMetadata?.contentType ?? contentTypeFor(path),
			size: obj.size
		};
	}
};
