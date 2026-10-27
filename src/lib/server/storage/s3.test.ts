/**
 * Runs the S3 backend against an in-memory fake of the S3 REST API, so the
 * request shapes (path-style URLs, prefixes, multipart, listing pages) are
 * exercised without a real bucket.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env }));

import { PART_SIZE, s3Storage } from "./s3.js";
import * as storage from "./index.js";

type Stored = { body: Uint8Array; contentType: string; lastModified: Date };

class FakeS3 {
	objects = new Map<string, Stored>();
	uploads = new Map<
		string,
		{ key: string; contentType: string; parts: Map<number, Uint8Array> }
	>();
	requests: { method: string; url: URL; size: number }[] = [];
	failPart: number | null = null;
	pageSize = 2;

	constructor(private base: string) {}

	handle = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const req = new Request(input, init);
		const url = new URL(req.url);
		const body = new Uint8Array(await req.arrayBuffer());
		this.requests.push({ method: req.method, url, size: body.byteLength });
		if (!req.headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256")) {
			return new Response("unsigned", { status: 403 });
		}
		if (!url.href.startsWith(this.base)) return new Response("NoSuchBucket", { status: 404 });
		const basePath = new URL(this.base).pathname.replace(/\/$/, "");
		const key = decodeURIComponent(url.pathname.slice(basePath.length + 1));
		const q = url.searchParams;

		if (req.method === "GET" && q.get("list-type") === "2") return this.list(q);
		if (req.method === "POST" && q.has("uploads")) {
			const id = `upload-${this.uploads.size + 1}`;
			const contentType = req.headers.get("content-type") ?? "";
			this.uploads.set(id, { key, contentType, parts: new Map() });
			return new Response(
				`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`
			);
		}
		const upload = this.uploads.get(q.get("uploadId") ?? "");
		if (upload && req.method === "PUT") {
			const n = Number(q.get("partNumber"));
			if (n === this.failPart) return new Response("AccessDenied", { status: 403 });
			upload.parts.set(n, body);
			return new Response(null, { headers: { etag: `"etag-${n}"` } });
		}
		if (upload && req.method === "POST") {
			const order = [
				...new TextDecoder()
					.decode(body)
					.matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>"etag-(\d+)"<\/ETag>/g)
			];
			const parts = order.map(([, n]) => upload.parts.get(Number(n))!);
			const all = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
			parts.reduce((offset, p) => (all.set(p, offset), offset + p.byteLength), 0);
			this.put(upload.key, all, upload.contentType);
			this.uploads.delete(q.get("uploadId")!);
			return new Response("<CompleteMultipartUploadResult/>");
		}
		if (upload && req.method === "DELETE") {
			this.uploads.delete(q.get("uploadId")!);
			return new Response(null, { status: 204 });
		}
		if (req.method === "PUT") {
			this.put(key, body, req.headers.get("content-type") ?? "binary/octet-stream");
			return new Response(null);
		}
		if (req.method === "DELETE") {
			this.objects.delete(key);
			return new Response(null, { status: 204 });
		}
		const obj = this.objects.get(key);
		if (!obj) return new Response("NoSuchKey", { status: 404 });
		return new Response(obj.body as BodyInit, {
			headers: {
				"content-type": obj.contentType,
				"content-length": String(obj.body.byteLength)
			}
		});
	};

	put(key: string, body: Uint8Array, contentType: string) {
		this.objects.set(key, {
			body,
			contentType,
			lastModified: new Date(Date.now() + this.objects.size)
		});
	}

	list(q: URLSearchParams): Response {
		const prefix = q.get("prefix") ?? "";
		const keys = [...this.objects.keys()]
			.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
			.sort();
		const start = Number(q.get("continuation-token") ?? 0);
		const page = keys.slice(start, start + this.pageSize);
		const truncated = start + this.pageSize < keys.length;
		const contents = page
			.map((k) => {
				const o = this.objects.get(k)!;
				return `<Contents><Key>${k.replace(/&/g, "&amp;")}</Key><LastModified>${o.lastModified.toISOString()}</LastModified><Size>${o.body.byteLength}</Size></Contents>`;
			})
			.join("");
		return new Response(
			`<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${contents}${truncated ? `<NextContinuationToken>${start + this.pageSize}</NextContinuationToken>` : ""}</ListBucketResult>`
		);
	}
}

function streamOf(total: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
	const pattern = new Uint8Array(chunk + 251).map((_, i) => i % 251);
	let sent = 0;
	return new ReadableStream({
		pull(controller) {
			if (sent >= total) return controller.close();
			const n = Math.min(chunk, total - sent);
			controller.enqueue(pattern.slice(sent % 251, (sent % 251) + n));
			sent += n;
		}
	});
}

async function bytes(path: string): Promise<Uint8Array | null> {
	const file = await s3Storage.get(path);
	return file ? new Uint8Array(await new Response(file.body).arrayBuffer()) : null;
}

let s3: FakeS3;

beforeEach(() => {
	Object.assign(env, {
		S3_BUCKET: "media",
		S3_ACCESS_KEY_ID: "key",
		S3_SECRET_ACCESS_KEY: "secret",
		S3_ENDPOINT: "http://s3.test/",
		S3_REGION: undefined,
		S3_PREFIX: "/shop/"
	});
	s3 = new FakeS3("http://s3.test/media");
	vi.stubGlobal("fetch", s3.handle);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("s3Storage", () => {
	it("stores under the prefix with a path-style URL and reads it back", async () => {
		const { url, pathname } = await s3Storage.upload(
			"products",
			"chair.webp",
			new Uint8Array([1, 2, 3])
		);

		expect(url).toBe(`/uploads/${pathname}`);
		expect(s3.objects.get(`shop/${pathname}`)?.contentType).toBe("image/webp");
		expect(s3.requests[0].url.href).toBe(`http://s3.test/media/shop/${pathname}`);

		const file = await s3Storage.get(pathname);
		expect(file?.contentType).toBe("image/webp");
		expect(file?.size).toBe(3);
		expect(await bytes(pathname)).toEqual(new Uint8Array([1, 2, 3]));
	});

	it("uses a virtual-hosted AWS URL when no endpoint is set", async () => {
		Object.assign(env, {
			S3_ENDPOINT: undefined,
			S3_REGION: "eu-north-1",
			S3_PREFIX: undefined
		});
		s3 = new FakeS3("https://media.s3.eu-north-1.amazonaws.com");
		vi.stubGlobal("fetch", s3.handle);

		const { pathname } = await s3Storage.upload("products", "chair.webp", new Uint8Array([1]));
		expect(s3.objects.has(pathname)).toBe(true);
	});

	it("puts a small stream in one request", async () => {
		const { pathname } = await s3Storage.uploadStream(
			"_private/digital",
			"guide.pdf",
			streamOf(1000),
			{
				contentType: "application/pdf",
				contentLength: 1000
			}
		);

		expect(s3.requests.map((r) => r.method)).toEqual(["PUT"]);
		expect(s3.objects.get(`shop/${pathname}`)?.contentType).toBe("application/pdf");
		expect((await bytes(pathname))?.byteLength).toBe(1000);
	});

	it("uploads a large stream in parts, never holding more than a part per request", async () => {
		const total = 2 * PART_SIZE + 12345;
		const { pathname } = await s3Storage.uploadStream(
			"_private/digital",
			"video.mp4",
			streamOf(total),
			{
				contentType: "video/mp4",
				contentLength: total
			}
		);

		const partSizes = s3.requests
			.filter((r) => r.url.searchParams.has("partNumber"))
			.map((r) => r.size);
		expect(partSizes).toEqual([PART_SIZE, PART_SIZE, 12345]);
		expect(Math.max(...s3.requests.map((r) => r.size))).toBeLessThanOrEqual(PART_SIZE);

		const stored = s3.objects.get(`shop/${pathname}`)!;
		expect(stored.contentType).toBe("video/mp4");
		expect(stored.body.byteLength).toBe(total);
		expect(stored.body[PART_SIZE + 7]).toBe((PART_SIZE + 7) % 251);
		expect(s3.uploads.size).toBe(0);
	});

	it("aborts the multipart upload and stops reading when a part fails", async () => {
		s3.failPart = 2;
		const total = 4 * PART_SIZE;
		const body = streamOf(total);
		await expect(
			s3Storage.uploadStream("_private/digital", "video.mp4", body, {
				contentType: "video/mp4",
				contentLength: total
			})
		).rejects.toThrow(/403/);

		expect(s3.requests.at(-1)?.method).toBe("DELETE");
		expect(s3.uploads.size).toBe(0);
		expect(s3.objects.size).toBe(0);
		expect(body.locked).toBe(false);
	});

	it("lists a folder's direct children across pages, newest first", async () => {
		s3.put("shop/products/a&b.webp", new Uint8Array(4), "image/webp");
		s3.put("shop/products/c.webp", new Uint8Array(5), "image/webp");
		s3.put("shop/products/d.webp", new Uint8Array(6), "image/webp");
		s3.put("shop/products/nested/e.webp", new Uint8Array(1), "image/webp");
		s3.put("shop/other/f.webp", new Uint8Array(1), "image/webp");

		const files = await s3Storage.list("products");

		expect(files.map((f) => [f.name, f.size, f.url])).toEqual([
			["d.webp", 6, "/uploads/products/d.webp"],
			["c.webp", 5, "/uploads/products/c.webp"],
			["a&b.webp", 4, "/uploads/products/a&b.webp"]
		]);
	});

	it("removes an object, and treats a missing one as gone", async () => {
		const { url, pathname } = await s3Storage.upload(
			"products",
			"chair.webp",
			new Uint8Array([1])
		);
		await s3Storage.remove(url);

		expect(s3.objects.size).toBe(0);
		expect(await s3Storage.get(pathname)).toBeNull();
	});

	it("refuses paths that could climb out of the prefix", async () => {
		expect(await s3Storage.get("products/../../secret")).toBeNull();
		expect(s3.requests).toEqual([]);
	});

	it("is the backend the storage seam picks when S3_BUCKET is set", async () => {
		const { pathname } = await storage.upload("products", "chair.webp", new Uint8Array([1]));
		expect(s3.objects.has(`shop/${pathname}`)).toBe(true);
	});
});
