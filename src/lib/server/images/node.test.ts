import { describe, it, expect, vi, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { testEnv as env } from "#lib/server/test-env.js";

import sharp from "sharp";
import { purgeResizedImages, resizeImage } from "./node.js";

const cacheDir = mkdtempSync(join(tmpdir(), "hoikka-cache-"));
env.CACHE_DIR = cacheDir;
const path = "products/photo.png";

const png = async () =>
	new Uint8Array(
		await sharp({ create: { width: 64, height: 32, channels: 3, background: "#c00" } })
			.png()
			.toBuffer()
	);

afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

describe("resizeImage", () => {
	it("reads the original only on a cache miss, caching under CACHE_DIR", async () => {
		const loadOriginal = vi.fn(png);

		const first = await resizeImage(path, 32, 80, loadOriginal);
		const second = await resizeImage(path, 32, 80, loadOriginal);

		expect(loadOriginal).toHaveBeenCalledTimes(1);
		expect(new Uint8Array(second!.body)).toEqual(new Uint8Array(first!.body));
		expect((await sharp(first!.body).metadata()).width).toBe(32);
		expect(existsSync(join(cacheDir, path, "w32q80.webp"))).toBe(true);
	});

	it("is null when the original is missing", async () => {
		expect(await resizeImage("products/gone.png", 32, 80, async () => null)).toBeNull();
	});

	it("never touches the disk for a path that climbs out of the cache", async () => {
		const loadOriginal = vi.fn(png);
		expect(await resizeImage("../../etc/photo.png", 32, 80, loadOriginal)).toBeNull();
		expect(loadOriginal).not.toHaveBeenCalled();
	});

	it("drops every cached size when the original is deleted", async () => {
		await resizeImage(path, 32, 80, png);
		await resizeImage(path, 16, 80, png);
		await purgeResizedImages(path);

		const loadOriginal = vi.fn(async () => null);
		expect(await resizeImage(path, 32, 80, loadOriginal)).toBeNull();
		expect(loadOriginal).toHaveBeenCalledTimes(1);
	});
});
