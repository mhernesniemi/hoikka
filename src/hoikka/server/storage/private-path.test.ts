/**
 * `/uploads/[...path]` serves the bucket publicly with immutable caching, so
 * the prefix check is the boundary that keeps paid deliverables out of it.
 */
import { describe, it, expect } from "vitest";
import { PRIVATE_PREFIX, isPrivatePath } from "./types.js";

describe("isPrivatePath", () => {
	it("matches the private namespace and everything under it", () => {
		expect(isPrivatePath(PRIVATE_PREFIX)).toBe(true);
		expect(isPrivatePath(`${PRIVATE_PREFIX}/digital`)).toBe(true);
		expect(isPrivatePath(`${PRIVATE_PREFIX}/digital/guide-abc123.pdf`)).toBe(true);
	});

	it("leaves ordinary media alone", () => {
		expect(isPrivatePath("products/chair-abc123.webp")).toBe(false);
		expect(isPrivatePath("_variants/products/chair.webp/w400q80.webp")).toBe(false);
	});

	it("is not fooled by a lookalike prefix", () => {
		expect(isPrivatePath("_privateer/leak.pdf")).toBe(false);
		expect(isPrivatePath("products/_private/leak.pdf")).toBe(false);
	});
});
