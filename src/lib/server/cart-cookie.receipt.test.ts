/**
 * The receipt capability is what stops an order code from being an
 * authorization: it travels in URLs and referrers, the capability does not.
 */
import { describe, it, expect } from "vitest";
import { addReceipt, grantReceipt, parseReceiptCookie, RECEIPT_COOKIE } from "./cart-cookie.js";

function jar(initial?: string) {
	const store = new Map<string, string>();
	if (initial) store.set(RECEIPT_COOKIE, initial);
	return {
		store,
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value)
	};
}

describe("receipt capability cookie", () => {
	it("round-trips tokens", () => {
		const cookies = jar();
		grantReceipt(cookies, "aaaaaaaaaaaaaaaaaaaa");

		expect(parseReceiptCookie(cookies.store.get(RECEIPT_COOKIE))).toEqual([
			"aaaaaaaaaaaaaaaaaaaa"
		]);
	});

	it("keeps earlier receipts readable after another purchase", () => {
		const cookies = jar();
		grantReceipt(cookies, "aaaaaaaaaaaaaaaaaaaa");
		grantReceipt(cookies, "bbbbbbbbbbbbbbbbbbbb");

		const tokens = parseReceiptCookie(cookies.store.get(RECEIPT_COOKIE));
		expect(tokens).toContain("aaaaaaaaaaaaaaaaaaaa");
		expect(tokens).toContain("bbbbbbbbbbbbbbbbbbbb");
	});

	it("keeps the ring bounded and most-recent-first", () => {
		let tokens: string[] = [];
		for (let i = 0; i < 9; i++) tokens = addReceipt(tokens, `token${i}`.padEnd(20, "x"));

		expect(tokens).toHaveLength(5);
		expect(tokens[0]).toBe("token8".padEnd(20, "x"));
	});

	it("does not duplicate a token that is granted twice", () => {
		let tokens = addReceipt([], "aaaaaaaaaaaaaaaaaaaa");
		tokens = addReceipt(tokens, "aaaaaaaaaaaaaaaaaaaa");

		expect(tokens).toHaveLength(1);
	});

	it("rejects malformed or injected cookie values", () => {
		expect(parseReceiptCookie(undefined)).toEqual([]);
		expect(parseReceiptCookie("")).toEqual([]);
		expect(parseReceiptCookie("short")).toEqual([]);
		expect(parseReceiptCookie("../../etc/passwd")).toEqual([]);
		// Only the well-formed entry survives a mixed value
		expect(parseReceiptCookie("bad!.aaaaaaaaaaaaaaaaaaaa")).toEqual(["aaaaaaaaaaaaaaaaaaaa"]);
	});

	it("is a no-op without a token or a cookie jar", () => {
		const cookies = jar();
		grantReceipt(cookies, null);
		expect(cookies.store.size).toBe(0);
		expect(() => grantReceipt(undefined, "aaaaaaaaaaaaaaaaaaaa")).not.toThrow();
	});
});
