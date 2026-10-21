/**
 * Logins for customers created ahead of them (imports, ERP syncs), against a
 * real in-memory SQLite.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, user } from "../db/schema.js";
import { customerService } from "./customers.js";

describe("provisionLogin", () => {
	beforeEach(async () => {
		await db.delete(customers);
		await db.delete(user);
	});

	it("creates an unverified user for a customer without one and links it", async () => {
		await db
			.insert(customers)
			.values({ email: "Sanna.Koski@example.com", firstName: "Sanna", lastName: "Koski" });

		await customerService.provisionLogin(" sanna.koski@EXAMPLE.com");

		const [login] = await db.select().from(user);
		expect(login).toMatchObject({
			email: "sanna.koski@example.com",
			name: "Sanna Koski",
			emailVerified: false,
			role: "customer"
		});
		const [customer] = await db.select().from(customers);
		expect(customer.authUserId).toBe(login.id);
	});

	it("does nothing for an email no customer has", async () => {
		await customerService.provisionLogin("nobody@example.com");
		expect(await db.select().from(user)).toHaveLength(0);
	});

	it("leaves an existing user to claim the customer at sign-in", async () => {
		const now = new Date();
		await db.insert(user).values({
			id: "existing",
			email: "peter@example.com",
			name: "Peter",
			createdAt: now,
			updatedAt: now
		});
		await db
			.insert(customers)
			.values({ email: "peter@example.com", firstName: "Peter", lastName: "Laine" });

		await customerService.provisionLogin("peter@example.com");

		expect(await db.select().from(user)).toHaveLength(1);
		const [customer] = await db
			.select()
			.from(customers)
			.where(eq(customers.email, "peter@example.com"));
		expect(customer.authUserId).toBeNull();
	});
});
