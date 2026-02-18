import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	formatPrice,
	formatPriceNumber,
	convertPrice,
	getCurrencySymbol,
	throttle,
	slugify,
	formatFileSize,
	stripHtml,
	formatDate,
	formatDateTime
} from "./utils";

describe("formatPrice", () => {
	it("formats EUR price with Finnish locale", () => {
		expect(formatPrice(2999)).toBe("29,99\u00a0€");
	});

	it("formats USD price with US locale", () => {
		expect(formatPrice(2999, "USD")).toBe("$29.99");
	});

	it("formats zero amount", () => {
		expect(formatPrice(0)).toBe("0,00\u00a0€");
	});

	it("falls back for unsupported currency", () => {
		expect(formatPrice(1000, "JPY")).toBe("10.00 JPY");
	});
});

describe("formatPriceNumber", () => {
	it("formats number with Finnish locale for EUR", () => {
		expect(formatPriceNumber(2999)).toBe("29,99");
	});

	it("formats number with US locale for USD", () => {
		expect(formatPriceNumber(2999, "USD")).toBe("29.99");
	});

	it("handles small amounts", () => {
		expect(formatPriceNumber(5)).toBe("0,05");
	});
});

describe("convertPrice", () => {
	it("converts with exchange rate 1", () => {
		expect(convertPrice(1000, 1)).toBe(1000);
	});

	it("converts EUR to USD", () => {
		expect(convertPrice(1000, 1.1)).toBe(1100);
	});

	it("rounds to nearest cent", () => {
		expect(convertPrice(1000, 1.115)).toBe(1115);
		expect(convertPrice(1001, 1.115)).toBe(1116);
	});
});

describe("getCurrencySymbol", () => {
	it("returns symbol for known currencies", () => {
		expect(getCurrencySymbol("EUR")).toBe("€");
		expect(getCurrencySymbol("USD")).toBe("$");
		expect(getCurrencySymbol("GBP")).toBe("£");
		expect(getCurrencySymbol("SEK")).toBe("kr");
	});

	it("returns code for unknown currencies", () => {
		expect(getCurrencySymbol("JPY")).toBe("JPY");
	});
});

describe("throttle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls function immediately on first call", () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 100);

		throttled();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("throttles subsequent calls", () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 100);

		throttled();
		throttled();
		throttled();

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("calls function again after wait period", () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 100);

		throttled();
		vi.advanceTimersByTime(100);
		throttled();

		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("schedules trailing call during throttle period", () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 100);

		throttled();
		throttled(); // This schedules a trailing call

		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledTimes(2);
	});
});

describe("slugify", () => {
	it("converts spaces to hyphens", () => {
		expect(slugify("hello world")).toBe("hello-world");
	});

	it("removes special characters", () => {
		expect(slugify("hello! @world#")).toBe("hello-world");
	});

	it("lowercases text", () => {
		expect(slugify("Hello World")).toBe("hello-world");
	});

	it("strips leading and trailing hyphens", () => {
		expect(slugify("--hello--")).toBe("hello");
	});

	it("collapses consecutive separators", () => {
		expect(slugify("a   b   c")).toBe("a-b-c");
	});

	it("returns empty string for empty input", () => {
		expect(slugify("")).toBe("");
	});

	it("returns empty string for only special chars", () => {
		expect(slugify("!@#$%")).toBe("");
	});
});

describe("formatFileSize", () => {
	it("formats 0 bytes", () => {
		expect(formatFileSize(0)).toBe("0 B");
	});

	it("formats bytes", () => {
		expect(formatFileSize(500)).toBe("500 B");
	});

	it("formats kilobytes", () => {
		expect(formatFileSize(1024)).toBe("1.0 KB");
	});

	it("formats megabytes", () => {
		expect(formatFileSize(1048576)).toBe("1.0 MB");
	});

	it("formats gigabytes", () => {
		expect(formatFileSize(1073741824)).toBe("1.0 GB");
	});

	it("formats fractional sizes", () => {
		expect(formatFileSize(1536)).toBe("1.5 KB");
	});
});

describe("stripHtml", () => {
	it("strips HTML tags", () => {
		expect(stripHtml("<p>hello</p>")).toBe("hello");
	});

	it("strips nested tags", () => {
		expect(stripHtml("<div><p><strong>bold</strong> text</p></div>")).toBe("bold text");
	});

	it("returns empty string for null", () => {
		expect(stripHtml(null)).toBe("");
	});

	it("returns empty string for undefined", () => {
		expect(stripHtml(undefined)).toBe("");
	});

	it("returns empty string for empty string", () => {
		expect(stripHtml("")).toBe("");
	});

	it("trims whitespace", () => {
		expect(stripHtml("  <p>hello</p>  ")).toBe("hello");
	});
});

describe("formatDate", () => {
	it("formats a Date object with fi-FI locale", () => {
		const result = formatDate(new Date(2026, 1, 10));
		expect(result).toBe("10.2.2026");
	});

	it("formats an ISO string", () => {
		const result = formatDate("2026-06-15T00:00:00Z");
		expect(result).toMatch(/15\.6\.2026/);
	});
});

describe("formatDateTime", () => {
	it("formats a date with time", () => {
		const result = formatDateTime(new Date(2026, 1, 10, 14, 30));
		expect(result).toContain("10.2.2026");
		// Should contain time portion
		expect(result).toMatch(/14[.:]30/);
	});
});
