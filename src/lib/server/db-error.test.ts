import { describe, it, expect } from "vitest";
import { dbError } from "./db-error";

describe("dbError", () => {
	it("returns friendly message for unique constraint with field and value", () => {
		const err = {
			code: "23505",
			detail: "Key (email)=(test@example.com) already exists"
		};
		expect(dbError(err, "Something went wrong")).toBe(
			'Email "test@example.com" is already in use'
		);
	});

	it("returns friendly message for unique constraint with sku field", () => {
		const err = {
			code: "23505",
			detail: "Key (sku)=(ABC-123) already exists"
		};
		expect(dbError(err, "Something went wrong")).toBe('SKU "ABC-123" is already in use');
	});

	it("returns friendly message for constraint name only", () => {
		const err = {
			code: "23505",
			message: 'unique constraint "products_slug_unique"'
		};
		expect(dbError(err, "Something went wrong")).toBe("This slug is already in use");
	});

	it("returns generic unique message when no details match", () => {
		const err = {
			code: "23505",
			message: "duplicate key value"
		};
		expect(dbError(err, "Something went wrong")).toBe(
			"A record with this value already exists"
		);
	});

	it("returns friendly message for FK violation", () => {
		const err = {
			code: "23503",
			message: "foreign key violation"
		};
		expect(dbError(err, "Something went wrong")).toBe(
			"Cannot complete this action because related data still exists"
		);
	});

	it("returns fallback for unknown pg error code", () => {
		const err = { code: "42601", message: "syntax error" };
		expect(dbError(err, "Something went wrong")).toBe("Something went wrong");
	});

	it("returns fallback for non-pg error", () => {
		const err = new Error("random error");
		expect(dbError(err, "Something went wrong")).toBe("Something went wrong");
	});

	it("extracts pg error from err.cause (Drizzle wrapping)", () => {
		const inner = {
			code: "23505",
			detail: "Key (email)=(a@b.com) already exists"
		};
		const err = { message: "Drizzle error", cause: inner };
		expect(dbError(err, "Something went wrong")).toBe('Email "a@b.com" is already in use');
	});
});
