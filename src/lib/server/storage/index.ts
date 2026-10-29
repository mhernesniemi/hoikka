/**
 * Asset storage seam, mirroring the db seam: when the R2 binding is present
 * (cloudflare target) it is used; otherwise files go to an
 * S3-compatible bucket when S3_BUCKET is set, or the local filesystem (node
 * target). Public URLs are `/uploads/...` on all three.
 */
import { S3_BUCKET } from "$app/env/private";
import { fsStorage } from "#lib/server/storage/fs.js";
// #lib specifiers so each build can swap the other target's module (vite.config.ts)
import { purgeResizedImages } from "#lib/server/images/node.js";
import { bindings } from "#lib/server/cloudflare.js";
import { r2Storage } from "./r2.js";
import { s3Storage } from "./s3.js";
import { PUBLIC_PREFIX, type StorageBackend } from "./types.js";

function backend(): StorageBackend {
	if (bindings?.ASSETS_BUCKET) return r2Storage;
	return S3_BUCKET ? s3Storage : fsStorage;
}

export const upload: StorageBackend["upload"] = (...args) => backend().upload(...args);
export const uploadStream: StorageBackend["uploadStream"] = (...args) =>
	backend().uploadStream(...args);
export const list: StorageBackend["list"] = (...args) => backend().list(...args);
export const get: StorageBackend["get"] = (...args) => backend().get(...args);

export const remove: StorageBackend["remove"] = async (url) => {
	const storage = backend();
	await storage.remove(url);
	// R2 keeps its variants in the bucket and drops them itself
	if (storage !== r2Storage && url.startsWith(PUBLIC_PREFIX + "/")) {
		await purgeResizedImages(url.slice(PUBLIC_PREFIX.length + 1));
	}
};
