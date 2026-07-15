/**
 * Local filesystem storage backend (node target). Files live under
 * `data/uploads/<folder>/` — outside `static/` so they survive builds — and
 * are served by the /uploads/[...path] route.
 */
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename, normalize } from "node:path";
import {
	PUBLIC_PREFIX,
	contentTypeFor,
	randomId,
	sanitizeFolder,
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
		const safeFolder = sanitizeFolder(folder);
		const dir = join(BASE_DIR, safeFolder);
		await mkdir(dir, { recursive: true });

		const ext = extname(filename);
		const stem = basename(filename, ext);
		const safeName = `${stem}-${randomId()}${ext}`;

		await writeFile(join(dir, safeName), body);

		return {
			url: `${PUBLIC_PREFIX}/${safeFolder}/${safeName}`,
			pathname: `${safeFolder}/${safeName}`
		};
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
		const body = await readFile(full);
		return { body, contentType: contentTypeFor(full), size: body.byteLength };
	}
};
