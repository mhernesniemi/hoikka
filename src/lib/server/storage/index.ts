/**
 * Asset storage seam, mirroring the db seam: when the R2 binding is present
 * on the request (cloudflare target) it is used; otherwise files go to the
 * local filesystem (node target). Public URLs are `/uploads/...` on both.
 */
import { getRequestEvent } from "$app/server";
import { fsStorage } from "$lib/server/storage/fs.js";
import { r2Storage } from "./r2.js";
import type { StorageBackend } from "./types.js";

function backend(): StorageBackend {
	try {
		if (getRequestEvent().platform?.env?.ASSETS_BUCKET) return r2Storage;
	} catch {
		// Outside request scope — fall through to fs
	}
	return fsStorage;
}

export const upload: StorageBackend["upload"] = (...args) => backend().upload(...args);
export const list: StorageBackend["list"] = (...args) => backend().list(...args);
export const remove: StorageBackend["remove"] = (...args) => backend().remove(...args);
export const get: StorageBackend["get"] = (...args) => backend().get(...args);
