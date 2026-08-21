/**
 * Both backends derive object keys the same way, so a file uploaded on Node and
 * one uploaded on Workers are reachable by identical /uploads paths — and
 * neither can be talked into writing outside its namespace.
 */
import { describe, it, expect } from "vitest";
import { storageKey } from "./types.js";

describe("storageKey", () => {
	it("keeps the folder, stem and extension", () => {
		const { key, name } = storageKey("products", "chair.webp");
		expect(key.startsWith("products/chair-")).toBe(true);
		expect(key.endsWith(".webp")).toBe(true);
		expect(key).toBe(`products/${name}`);
	});

	it("makes every upload of the same name a distinct object", () => {
		const a = storageKey("products", "chair.webp");
		const b = storageKey("products", "chair.webp");
		expect(a.key).not.toBe(b.key);
	});

	it("handles a name with no extension", () => {
		expect(storageKey("_private/digital", "README").key).toMatch(
			/^_private\/digital\/README-\w+$/
		);
	});

	it("refuses to escape its folder", () => {
		expect(storageKey("../../etc", "passwd").key.startsWith("etc/")).toBe(true);
		expect(storageKey("products", "../../../etc/passwd").key.startsWith("products/")).toBe(
			true
		);
	});
});
