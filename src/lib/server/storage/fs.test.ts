import { describe, it, expect, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { testEnv as env } from "#lib/server/test-env.js";

import { fsStorage } from "./fs.js";
import { cacheDir } from "./paths.js";

const dir = mkdtempSync(join(tmpdir(), "hoikka-uploads-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("fsStorage", () => {
	it("keeps files under UPLOADS_DIR", async () => {
		env.UPLOADS_DIR = dir;
		const { url, pathname } = await fsStorage.upload(
			"products",
			"chair.webp",
			new Uint8Array([1, 2])
		);
		const streamed = await fsStorage.uploadStream(
			"_private/digital",
			"guide.pdf",
			new Response(new Uint8Array(5)).body!,
			{ contentType: "application/pdf", contentLength: 5 }
		);

		expect(existsSync(join(dir, pathname))).toBe(true);
		expect(existsSync(join(dir, streamed.pathname))).toBe(true);
		expect((await fsStorage.get(pathname))?.size).toBe(2);
		expect((await fsStorage.list("products")).map((f) => f.url)).toEqual([url]);

		await fsStorage.remove(url);
		expect(existsSync(join(dir, pathname))).toBe(false);
	});
});

describe("cacheDir", () => {
	it("defaults inside the uploads, and can move out of them", () => {
		env.UPLOADS_DIR = undefined;
		env.CACHE_DIR = undefined;
		expect(cacheDir()).toBe("data/uploads/.cache");

		env.UPLOADS_DIR = "/var/lib/hoikka/uploads";
		expect(cacheDir()).toBe("/var/lib/hoikka/uploads/.cache");

		env.CACHE_DIR = "/var/cache/hoikka";
		expect(cacheDir()).toBe("/var/cache/hoikka");
	});
});
