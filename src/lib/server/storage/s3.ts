/**
 * S3-compatible storage backend (node target): AWS S3, UpCloud Object
 * Storage, Hetzner, MinIO, R2's S3 API… Selected when S3_BUCKET is set.
 * Object keys mirror the fs layout (`<folder>/<filename>`, under S3_PREFIX),
 * and files are still served through /uploads/[...path], so the bucket can
 * stay private.
 */
import { AwsClient } from "aws4fetch";
import { env } from "$env/dynamic/private";
import {
	PUBLIC_PREFIX,
	contentTypeFor,
	sanitizeFolder,
	storageKey,
	type StorageBackend
} from "./types.js";

/** S3 allows 5 MiB minimum for every part but the last. */
export const PART_SIZE = 8 * 1024 * 1024;

type S3Config = { client: AwsClient; baseUrl: string; prefix: string };

let cached: { key: string; config: S3Config } | null = null;

function getConfig(): S3Config {
	const read = (name: string) => env[name]?.trim() || undefined;
	const bucket = read("S3_BUCKET");
	const accessKeyId = read("S3_ACCESS_KEY_ID");
	const secretAccessKey = read("S3_SECRET_ACCESS_KEY");
	if (!bucket || !accessKeyId || !secretAccessKey) {
		throw new Error("S3 storage needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
	}
	const region = read("S3_REGION") ?? "us-east-1";
	const endpoint = read("S3_ENDPOINT")?.replace(/\/+$/, "");
	const prefix = (read("S3_PREFIX") ?? "").replace(/^\/+|\/+$/g, "");

	const key = [bucket, accessKeyId, secretAccessKey, region, endpoint, prefix].join("\0");
	if (cached?.key === key) return cached.config;

	// Custom endpoints get path-style URLs (universally supported); AWS itself gets virtual-hosted
	const baseUrl = endpoint
		? `${endpoint}/${bucket}`
		: `https://${bucket}.s3.${region}.amazonaws.com`;
	const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
	cached = { key, config: { client, baseUrl, prefix } };
	return cached.config;
}

function withPrefix(path: string): string {
	const { prefix } = getConfig();
	return prefix ? `${prefix}/${path}` : path;
}

/** Dot segments would be normalized away by URL parsing and could address keys outside the prefix. */
function objectUrl(path: string): string | null {
	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) return null;
	return `${getConfig().baseUrl}/${withPrefix(segments.join("/")).split("/").map(encodeURIComponent).join("/")}`;
}

async function send(url: string, init: RequestInit, what: string): Promise<Response | null> {
	const res = await getConfig().client.fetch(url, init);
	if (res.status === 404) {
		await res.body?.cancel();
		return null;
	}
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(`S3 ${init.method} ${what} failed: ${res.status} ${detail.slice(0, 200)}`);
	}
	return res;
}

async function sendOk(url: string, init: RequestInit, what: string): Promise<Response> {
	const res = await send(url, init, what);
	if (!res) throw new Error(`S3 ${init.method} ${what} failed: bucket not found`);
	return res;
}

function xmlValues(xml: string, tag: string): string[] {
	return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) =>
		m[1]
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&amp;/g, "&")
	);
}

/** Re-chunk a stream into PART_SIZE pieces, holding at most one part in memory. */
async function* parts(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
	const reader = body.getReader();
	let part = new Uint8Array(PART_SIZE);
	let filled = 0;
	let finished = false;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			let offset = 0;
			while (offset < value.length) {
				const n = Math.min(PART_SIZE - filled, value.length - offset);
				part.set(value.subarray(offset, offset + n), filled);
				filled += n;
				offset += n;
				if (filled === PART_SIZE) {
					yield part;
					part = new Uint8Array(PART_SIZE);
					filled = 0;
				}
			}
		}
		finished = true;
		if (filled > 0) yield part.subarray(0, filled);
	} finally {
		// Stopped early (a part failed): stop reading the upload too
		if (!finished) await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

async function multipartUpload(
	key: string,
	chunks: AsyncIterable<Uint8Array>,
	contentType: string
): Promise<void> {
	const url = objectUrl(key)!;
	const created = await sendOk(
		`${url}?uploads`,
		{ method: "POST", headers: { "content-type": contentType } },
		key
	);
	const [uploadId] = xmlValues(await created.text(), "UploadId");
	if (!uploadId) throw new Error(`S3 multipart upload of ${key} returned no UploadId`);
	const query = `uploadId=${encodeURIComponent(uploadId)}`;

	try {
		const etags: string[] = [];
		for await (const part of chunks) {
			const res = await sendOk(
				`${url}?partNumber=${etags.length + 1}&${query}`,
				{ method: "PUT", body: part as BodyInit },
				key
			);
			etags.push(res.headers.get("etag") ?? "");
		}

		const manifest = etags
			.map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
			.join("");
		const done = await sendOk(
			`${url}?${query}`,
			{
				method: "POST",
				headers: { "content-type": "application/xml" },
				body: `<CompleteMultipartUpload>${manifest}</CompleteMultipartUpload>`
			},
			key
		);
		// CompleteMultipartUpload can fail with a 200 and an <Error> body
		const result = await done.text();
		if (result.includes("<Error>")) {
			throw new Error(`S3 multipart upload of ${key} failed: ${result.slice(0, 200)}`);
		}
	} catch (err) {
		await getConfig()
			.client.fetch(`${url}?${query}`, { method: "DELETE" })
			.catch(() => {});
		throw err;
	}
}

export const s3Storage: StorageBackend = {
	async upload(folder, filename, body) {
		const { key, name } = storageKey(folder, filename);
		await sendOk(
			objectUrl(key)!,
			{
				method: "PUT",
				body: body as BodyInit,
				headers: { "content-type": contentTypeFor(name) }
			},
			key
		);
		return { url: `${PUBLIC_PREFIX}/${key}`, pathname: key };
	},

	async uploadStream(folder, filename, body, { contentType }) {
		const { key } = storageKey(folder, filename);
		const chunks = parts(body);
		const first = await chunks.next();
		const second = first.done ? first : await chunks.next();

		if (second.done) {
			await sendOk(
				objectUrl(key)!,
				{
					method: "PUT",
					body: (first.done ? new Uint8Array() : first.value) as BodyInit,
					headers: { "content-type": contentType }
				},
				key
			);
		} else {
			const all = (async function* () {
				try {
					yield first.value;
					yield second.value;
					yield* chunks;
				} finally {
					await chunks.return(undefined);
				}
			})();
			await multipartUpload(key, all, contentType);
		}

		return { url: `${PUBLIC_PREFIX}/${key}`, pathname: key };
	},

	async list(folder) {
		const safeFolder = sanitizeFolder(folder);
		const prefix = withPrefix(`${safeFolder}/`);
		const files: Awaited<ReturnType<StorageBackend["list"]>> = [];
		let token: string | undefined;

		do {
			const params = new URLSearchParams({ "list-type": "2", prefix, delimiter: "/" });
			if (token) params.set("continuation-token", token);
			const res = await sendOk(`${getConfig().baseUrl}?${params}`, { method: "GET" }, prefix);
			const xml = await res.text();

			for (const entry of xmlValues(xml, "Contents")) {
				const [key] = xmlValues(entry, "Key");
				const name = key.slice(prefix.length);
				if (!name) continue;
				files.push({
					url: `${PUBLIC_PREFIX}/${safeFolder}/${name}`,
					name,
					size: Number(xmlValues(entry, "Size")[0] ?? 0),
					uploadedAt: new Date(xmlValues(entry, "LastModified")[0] ?? 0)
				});
			}
			token =
				xmlValues(xml, "IsTruncated")[0] === "true"
					? xmlValues(xml, "NextContinuationToken")[0]
					: undefined;
		} while (token);

		return files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
	},

	async remove(url) {
		if (!url.startsWith(PUBLIC_PREFIX + "/")) return;
		const path = url.slice(PUBLIC_PREFIX.length + 1);
		const target = objectUrl(path);
		if (!target) return;
		// DELETE is idempotent (204 for missing keys), so a 404 means the bucket is wrong
		await sendOk(target, { method: "DELETE" }, path);
	},

	async get(path) {
		const url = objectUrl(path);
		if (!url) return null;
		const res = await send(url, { method: "GET" }, path);
		if (!res?.body) return null;
		return {
			body: res.body,
			contentType: res.headers.get("content-type") ?? contentTypeFor(path),
			size: Number(res.headers.get("content-length") ?? 0)
		};
	}
};
