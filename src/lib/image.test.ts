import { describe, it, expect } from "vitest";
import { focalPosition } from "./image";

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

	it("handles string values", () => {
		expect(focalPosition("0.25", "0.75")).toBe("25% 75%");
	});

	it("handles 0 values (top-left corner)", () => {
		expect(focalPosition(0, 0)).toBe("0% 0%");
	});

	it("handles 1 values (bottom-right corner)", () => {
		expect(focalPosition(1, 1)).toBe("100% 100%");
	});
});
