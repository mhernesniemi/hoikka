/**
 * Local filesystem storage backend (node target). Files live under
 * `data/uploads/<folder>/` — outside `static/` so they survive builds — and
 * are served by the /uploads/[...path] route.
 */
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, normalize } from "node:path";
import {
	PUBLIC_PREFIX,
	contentTypeFor,
	sanitizeFolder,
	storageKey,
	type StorageBackend
} from "./types.js";

const BASE_DIR = "data/uploads";

/** Resolve a storage-relative path to a disk path, rejecting traversal. */
function diskPath(path: string): string | null {
	const normalized = normalize(path);
	if (normalized.startsWith("..") || normalized.startsWith("/")) return null;
	return join(BASE_DIR, normalized);
}

export const fsStorage: StorageBackend = {
	async upload(folder, filename, body) {
		const { key } = storageKey(folder, filename);
		await mkdir(join(BASE_DIR, sanitizeFolder(folder)), { recursive: true });
		await writeFile(join(BASE_DIR, key), body);

		return { url: `${PUBLIC_PREFIX}/${key}`, pathname: key };
	},

	async uploadStream(folder, filename, body) {
		const { key } = storageKey(folder, filename);
		await mkdir(join(BASE_DIR, sanitizeFolder(folder)), { recursive: true });

		// Piped rather than buffered, to match the Workers path: a deliverable
		// can be far larger than anything worth holding in memory.
		await pipeline(
			Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
			createWriteStream(join(BASE_DIR, key))
		);

		return { url: `${PUBLIC_PREFIX}/${key}`, pathname: key };
	},

	async list(folder) {
		const safeFolder = sanitizeFolder(folder);
		const dir = join(BASE_DIR, safeFolder);
		if (!existsSync(dir)) return [];

		const entries = await readdir(dir, { withFileTypes: true });
		const out = await Promise.all(
			entries
				.filter((e) => e.isFile())
				.map(async (e) => {
					const s = await stat(join(dir, e.name));
					return {
						url: `${PUBLIC_PREFIX}/${safeFolder}/${e.name}`,
						name: e.name,
						size: s.size,
						uploadedAt: s.mtime
					};
				})
		);
		return out.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
	},

	async remove(url) {
		if (!url.startsWith(PUBLIC_PREFIX + "/")) return;
		const path = diskPath(url.slice(PUBLIC_PREFIX.length + 1));
		if (!path || !existsSync(path)) return;
		await unlink(path);
	},

	async get(path) {
		const full = diskPath(path);
		if (!full || !existsSync(full)) return null;
		const { size } = await stat(full);

		// Streamed, not read into a buffer: a digital deliverable can be
		// hundreds of megabytes, and several buyers can redeem their downloads
		// at the same moment. Callers that need bytes (image resizing) buffer
		// deliberately; nothing should do it by accident.
		const body = Readable.toWeb(
			createReadStream(full)
		) as unknown as ReadableStream<Uint8Array>;

		return { body, contentType: contentTypeFor(full), size };
	}
};
