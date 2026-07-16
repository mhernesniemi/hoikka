import { describe, it, expect } from "vitest";
import { focalPosition, imageUrl, imageSrcset } from "./image";

describe("imageUrl", () => {
	it("appends resize params for local uploads", () => {
		expect(imageUrl("/uploads/products/a.png", 400)).toBe("/uploads/products/a.png?w=400&q=80");
	});

	it("passes external URLs through untouched", () => {
		expect(imageUrl("https://cdn.example.com/a.png", 400)).toBe(
			"https://cdn.example.com/a.png"
		);
	});
});

describe("imageSrcset", () => {
	it("serves the 2x candidate at reduced quality", () => {
		expect(imageSrcset("/uploads/products/a.png", 400)).toBe(
			"/uploads/products/a.png?w=400&q=80 1x, /uploads/products/a.png?w=800&q=60 2x"
		);
	});

	it("never drops below the quality floor", () => {
		expect(imageSrcset("/uploads/products/a.png", 400, 45)).toContain("w=800&q=40 2x");
	});

	it("returns undefined for external URLs", () => {
		expect(imageSrcset("https://cdn.example.com/a.png", 400)).toBeUndefined();
	});
});

describe("focalPosition", () => {
	it("returns 50% 50% for null values", () => {
		expect(focalPosition(null, null)).toBe("50% 50%");
	});

	it("returns 50% 50% for undefined values", () => {
		expect(focalPosition(undefined, undefined)).toBe("50% 50%");
	});

	it("converts numeric values to percentages", () => {
		expect(focalPosition(0.3, 0.7)).toBe("30% 70%");
	});

	it("handles 0 values (top-left corner)", () => {
		expect(focalPosition(0, 0)).toBe("0% 0%");
	});

	it("handles 1 values (bottom-right corner)", () => {
		expect(focalPosition(1, 1)).toBe("100% 100%");
	});
});
