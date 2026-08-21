import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { dbError } from "./db-error";

describe("dbError", () => {
	it("handles better-sqlite3 unique violation", () => {
		const err = {
			code: "SQLITE_CONSTRAINT_UNIQUE",
			message: "UNIQUE constraint failed: products.slug"
		};
		expect(dbError(err, "Something went wrong")).toBe("This slug is already in use");
	});

	it("labels known fields (SKU)", () => {
		const err = {
			code: "SQLITE_CONSTRAINT_UNIQUE",
			message: "UNIQUE constraint failed: product_variants.sku"
		};
		expect(dbError(err, "Something went wrong")).toBe("This SKU is already in use");
	});

	it("handles D1's prefixed/suffixed message shape", () => {
		const err = new Error("D1_ERROR: UNIQUE constraint failed: user.email: SQLITE_CONSTRAINT");
		expect(dbError(err, "Something went wrong")).toBe("This email is already in use");
	});

	it("uses the first column of a composite unique constraint", () => {
		const err = {
			message:
				"UNIQUE constraint failed: product_translations.product_id, product_translations.language_code"
		};
		expect(dbError(err, "Something went wrong")).toBe("This product id is already in use");
	});

	it("handles FK violations from both drivers", () => {
		expect(dbError({ message: "FOREIGN KEY constraint failed" }, "Something went wrong")).toBe(
			"Cannot complete this action because related data still exists"
		);
		expect(
			dbError(
				new Error("D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT"),
				"Something went wrong"
			)
		).toBe("Cannot complete this action because related data still exists");
	});

	it("handles NOT NULL violations", () => {
		const err = { message: "NOT NULL constraint failed: products.name" };
		expect(dbError(err, "Something went wrong")).toBe("A required field is missing");
	});

	it("extracts the driver error from err.cause (Drizzle wrapping)", () => {
		const inner = { message: "UNIQUE constraint failed: products.slug" };
		const err = { message: "Failed query", cause: inner };
		expect(dbError(err, "Something went wrong")).toBe("This slug is already in use");
	});

	it("returns fallback for non-constraint errors", () => {
		expect(dbError(new Error("random error"), "Something went wrong")).toBe(
			"Something went wrong"
		);
		expect(dbError({ code: "42601", message: "syntax error" }, "Something went wrong")).toBe(
			"Something went wrong"
		);
		expect(dbError(null, "Something went wrong")).toBe("Something went wrong");
	});
});

// Real-driver errors, not hand-built shapes — so mock-shaped tests can't rot.
describe("dbError against the real driver", () => {
	const t = sqliteTable("t", {
		id: integer("id").primaryKey(),
		slug: text("slug").unique(),
		other: integer("other_id")
	});
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE t (id integer primary key, slug text unique, other_id integer references t(id)); PRAGMA foreign_keys=ON;"
	);
	const db = drizzle(sqlite);

	it("maps a real unique violation", async () => {
		await db.insert(t).values({ id: 1, slug: "a" });
		const caught = await db
			.insert(t)
			.values({ id: 2, slug: "a" })
			.then(() => null)
			.catch((e) => e);
		expect(dbError(caught, "FALLBACK")).toBe("This slug is already in use");
	});

	it("maps a real FK violation", async () => {
		const caught = await db
			.insert(t)
			.values({ id: 3, slug: "c", other: 999 })
			.then(() => null)
			.catch((e) => e);
		expect(dbError(caught, "FALLBACK")).toBe(
			"Cannot complete this action because related data still exists"
		);
	});
});
