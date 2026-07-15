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
	list(folder: string): Promise<StoredFile[]>;
	remove(url: string): Promise<void>;
	get(path: string): Promise<StorageObject | null>;
}

export const PUBLIC_PREFIX = "/uploads";

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

export function sanitizeFolder(folder: string): string {
	return folder.replace(/\.\.+/g, "").replace(/^\/+|\/+$/g, "");
}

export function randomId(length = 12): string {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let id = "";
	for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
	return id;
}
