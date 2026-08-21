export interface StoredFile {
	url: string;
	name: string;
	size: number;
	uploadedAt: Date;
}

export interface StorageObject {
	body: BodyInit;
	contentType: string;
	size: number;
}

export interface StorageBackend {
	upload(
		folder: string,
		filename: string,
		body: Uint8Array
	): Promise<{ url: string; pathname: string }>;
	/**
	 * Store a file without ever holding it in memory. Digital deliverables run
	 * to hundreds of megabytes, which is well past a Workers isolate's limit —
	 * buffering one (let alone twice, as form parsing plus arrayBuffer would)
	 * takes the whole request down.
	 */
	uploadStream(
		folder: string,
		filename: string,
		body: ReadableStream<Uint8Array>,
		options: { contentType: string; contentLength: number }
	): Promise<{ url: string; pathname: string }>;
	list(folder: string): Promise<StoredFile[]>;
	remove(url: string): Promise<void>;
	get(path: string): Promise<StorageObject | null>;
}

export const PUBLIC_PREFIX = "/uploads";

/** Bucket prefix for persisted resized variants (`_variants/<original key>/w<w>q<q>.webp`) */
export const VARIANT_PREFIX = "_variants";

/**
 * Bucket prefix for files that must never be served from `/uploads/...`:
 * the deliverables of digital products. They are only reachable through
 * `/downloads/<token>`, which checks the grant's expiry and use count first.
 * The uploads route refuses this prefix outright, so knowing (or guessing) a
 * storage path buys nothing.
 */
export const PRIVATE_PREFIX = "_private";

export function isPrivatePath(path: string): boolean {
	return path === PRIVATE_PREFIX || path.startsWith(`${PRIVATE_PREFIX}/`);
}

const CONTENT_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".avif": "image/avif",
	".svg": "image/svg+xml",
	".pdf": "application/pdf"
};

export function contentTypeFor(filename: string): string {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** `<folder>/<stem>-<random><ext>`, shared by both backends. */
export function storageKey(folder: string, filename: string): { key: string; name: string } {
	const safeFolder = sanitizeFolder(folder);
	const base = filename.split("/").pop() ?? filename;
	const dot = base.lastIndexOf(".");
	const ext = dot === -1 ? "" : base.slice(dot);
	const stem = dot === -1 ? base : base.slice(0, dot);
	const name = `${stem}-${randomId()}${ext}`;
	return { key: `${safeFolder}/${name}`, name };
}

export function sanitizeFolder(folder: string): string {
	return folder.replace(/\.\.+/g, "").replace(/^\/+|\/+$/g, "");
}

export function randomId(length = 12): string {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let id = "";
	for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
	return id;
}
