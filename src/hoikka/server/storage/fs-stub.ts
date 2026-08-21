/**
 * Build-time stand-in for fs.ts on the cloudflare target — keeps node:fs out
 * of the Workers bundle. See the `resolve.alias` block in vite.config.ts.
 */
import type { StorageBackend } from "./types.js";

function unavailable(): never {
	throw new Error("Filesystem storage is not available on the cloudflare target");
}

export const fsStorage: StorageBackend = {
	upload: unavailable,
	uploadStream: unavailable,
	list: unavailable,
	remove: unavailable,
	get: unavailable
};
