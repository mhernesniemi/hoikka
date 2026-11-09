import { describe, it, expect } from "vitest";
import { matchesPath } from "./route-paths.js";

describe("matchesPath", () => {
	it("matches a path and everything below it", () => {
		expect(matchesPath("/brands", ["/brands"])).toBe(true);
		expect(matchesPath("/brands/acme", ["/brands"])).toBe(true);
		expect(matchesPath("/brands/", ["/brands/"])).toBe(true);
		expect(matchesPath("/brandsale", ["/brands"])).toBe(false);
	});

	it("matches the front page only with /", () => {
		expect(matchesPath("/", ["/"])).toBe(true);
		expect(matchesPath("/checkout", ["/"])).toBe(false);
	});
});
