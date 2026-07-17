import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
	it("keeps normal rich-text markup", () => {
		const html = "<h2>Hi</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p>";
		expect(sanitizeHtml(html)).toBe(html);
	});

	it("strips script tags", () => {
		expect(sanitizeHtml("<p>ok</p><script>alert(1)</script>")).not.toContain("<script");
	});

	it("is not bypassable with nested/split tags (the regex-sanitizer hole)", () => {
		const out = sanitizeHtml("<scr<script>ipt>alert(1)</scr</script>ipt>");
		expect(out).not.toContain("<script");
		expect(out).not.toMatch(/<scr<script>/);
	});

	it("strips event handlers and javascript: URLs", () => {
		expect(sanitizeHtml('<p onclick="x()">hi</p>')).not.toContain("onclick");
		expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
	});
});
