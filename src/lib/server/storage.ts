/**
 * Local filesystem asset storage. Files live under `static/uploads/<folder>/`
 * so SvelteKit serves them directly at `/uploads/<folder>/<filename>`.
 * R2 adapter will slot in here during the Cloudflare migration.
 */
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const BASE_DIR = "static/uploads";
const PUBLIC_PREFIX = "/uploads";

function randomId(length = 12): string {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let id = "";
	for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
	return id;
}

function sanitizeFolder(folder: string): string {
	return folder.replace(/\.\.+/g, "").replace(/^\/+|\/+$/g, "");
}

/**
 * Convert a public URL from this storage back to an absolute disk path.
 * Returns null when the URL is from a different origin (e.g. legacy Vercel Blob).
 */
function pathFromPublicUrl(url: string): string | null {
	if (!url.startsWith(PUBLIC_PREFIX + "/")) return null;
	return join(BASE_DIR, url.slice(PUBLIC_PREFIX.length + 1));
}

export async function upload(
	folder: string,
	filename: string,
	body: Buffer | Uint8Array
): Promise<{ url: string; pathname: string }> {
	const safeFolder = sanitizeFolder(folder);
	const dir = join(BASE_DIR, safeFolder);
	await mkdir(dir, { recursive: true });

	const ext = extname(filename);
	const stem = basename(filename, ext);
	const safeName = `${stem}-${randomId()}${ext}`;
	const diskPath = join(dir, safeName);

	await writeFile(diskPath, body);

	return {
		url: `${PUBLIC_PREFIX}/${safeFolder}/${safeName}`,
		pathname: `${safeFolder}/${safeName}`
	};
}

export async function list(folder: string) {
	const safeFolder = sanitizeFolder(folder);
	const dir = join(BASE_DIR, safeFolder);
	if (!existsSync(dir)) return [];

	const entries = await readdir(dir, { withFileTypes: true });
	const out = await Promise.all(
		entries
			.filter((e) => e.isFile())
			.map(async (e) => {
				const full = join(dir, e.name);
				const s = await stat(full);
				return {
					url: `${PUBLIC_PREFIX}/${safeFolder}/${e.name}`,
					name: e.name,
					size: s.size,
					uploadedAt: s.mtime
				};
			})
	);
	return out.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

/**
 * Delete a file by its public URL. No-op (silent) if the URL points outside
 * our storage or the file no longer exists.
 */
export async function remove(url: string): Promise<void> {
	const path = pathFromPublicUrl(url);
	if (!path || !existsSync(path)) return;
	await unlink(path);
}
