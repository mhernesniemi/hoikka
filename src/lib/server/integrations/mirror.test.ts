/**
 * mirrorRecords against a real in-memory SQLite, with a project-style mirror
 * table and a child table, so the atomic batch is what's under test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createNodeDb } from "../db/node.js";
import { outbox } from "../db/schema.js";
import { mirrorRecords, type MirrorOptions } from "./mirror.js";

const erpOrders = sqliteTable("erp_orders", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	erpId: text("erp_id").notNull().unique(),
	status: text("status").notNull(),
	deletedAt: integer("deleted_at"),
	sourceHash: text("source_hash").notNull()
});
const erpOrderLines = sqliteTable("erp_order_lines", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	orderId: integer("order_id").notNull(),
	sku: text("sku").notNull()
});

interface ErpOrder {
	id: string;
	status: string;
	lines: string[];
}

type Db = ReturnType<typeof createNodeDb>;
let db: Db;

function options(
	records: ErpOrder[],
	overrides: Partial<MirrorOptions<ErpOrder, typeof erpOrders>> = {}
): MirrorOptions<ErpOrder, typeof erpOrders> {
	return {
		records,
		key: (order) => order.id,
		table: erpOrders,
		keyColumn: erpOrders.erpId,
		hashColumn: erpOrders.sourceHash,
		initial: (order) => ({ status: order.status }),
		write: (order, id) => [
			db.update(erpOrders).set({ status: order.status }).where(eq(erpOrders.id, id)),
			db.delete(erpOrderLines).where(eq(erpOrderLines.orderId, id)),
			...order.lines.map((sku) => db.insert(erpOrderLines).values({ orderId: id, sku }))
		],
		changes: (before, order) =>
			before.status === order.status
				? []
				: [
						{
							type: "order.status_changed",
							payload: { id: order.id, status: order.status }
						}
					],
		...overrides
	};
}

const order = (id: string, status = "open", lines = ["A-1"]): ErpOrder => ({ id, status, lines });

async function storedOrder(erpId: string) {
	const [row] = await db.select().from(erpOrders).where(eq(erpOrders.erpId, erpId));
	return row;
}

describe("mirrorRecords", () => {
	beforeEach(() => {
		db = createNodeDb(":memory:");
		db.run(
			sql`create table erp_orders (id integer primary key autoincrement, erp_id text not null unique, status text not null, deleted_at integer, source_hash text not null)`
		);
		db.run(
			sql`create table erp_order_lines (id integer primary key autoincrement, order_id integer not null, sku text not null)`
		);
	});

	it("creates new records with their child rows and fires no events", async () => {
		const summary = await mirrorRecords(
			db,
			options([order("1"), order("2", "open", ["B", "C"])])
		);

		expect(summary).toEqual({ total: 2, changed: 0, created: 2, events: 0, removed: 0 });
		expect(await db.select().from(erpOrderLines)).toHaveLength(3);
		expect((await storedOrder("1")).sourceHash).not.toBe("");
		expect(await db.select().from(outbox)).toHaveLength(0);
	});

	it("skips unchanged records without writing", async () => {
		await mirrorRecords(db, options([order("1")]));
		const write = () => {
			throw new Error("should not write");
		};

		const summary = await mirrorRecords(db, options([order("1")], { write }));

		expect(summary).toEqual({ total: 1, changed: 0, created: 0, events: 0, removed: 0 });
	});

	it("writes a changed record with its events and new hash", async () => {
		await mirrorRecords(db, options([order("1"), order("2")]));
		const before = await storedOrder("1");

		const summary = await mirrorRecords(
			db,
			options([order("1", "shipped", ["A-1", "A-2"]), order("2")])
		);

		expect(summary).toEqual({ total: 2, changed: 1, created: 0, events: 1, removed: 0 });
		const after = await storedOrder("1");
		expect(after.status).toBe("shipped");
		expect(after.sourceHash).not.toBe(before.sourceHash);
		expect(
			await db.select().from(erpOrderLines).where(eq(erpOrderLines.orderId, after.id))
		).toHaveLength(2);
		const [event] = await db.select().from(outbox);
		expect(event).toMatchObject({
			type: "order.status_changed",
			payload: { id: "1", status: "shipped" }
		});
	});

	it("keeps the old hash and no events when a record's batch fails", async () => {
		await mirrorRecords(db, options([order("1"), order("2")]));
		const before = await storedOrder("1");
		const failing = options([order("1", "shipped"), order("2", "shipped")], {
			write: (record, id) => [
				db.update(erpOrders).set({ status: record.status }).where(eq(erpOrders.id, id)),
				// NOT NULL violation for order 1 only
				db
					.insert(erpOrderLines)
					.values({ orderId: id, sku: (record.id === "1" ? null : "X") as string })
			]
		});

		await expect(mirrorRecords(db, failing)).rejects.toThrow(
			/1 of 2 records failed to mirror \(1\)/
		);

		expect(await storedOrder("1")).toEqual(before);
		expect((await storedOrder("2")).status).toBe("shipped");
		const events = await db.select().from(outbox);
		expect(events.map((event) => event.payload)).toEqual([{ id: "2", status: "shipped" }]);

		// The next run retries it, and its notification is not lost
		const retry = await mirrorRecords(
			db,
			options([order("1", "shipped"), order("2", "shipped")])
		);
		expect(retry).toMatchObject({ changed: 1, events: 1 });
	});

	it("treats a first write that never finished as new, without events", async () => {
		await db.insert(erpOrders).values({ erpId: "1", status: "open", sourceHash: "" });

		const summary = await mirrorRecords(db, options([order("1", "shipped")]));

		expect(summary).toMatchObject({ created: 1, changed: 0, events: 0 });
		expect(await db.select().from(erpOrders)).toHaveLength(1);
		expect((await storedOrder("1")).status).toBe("shipped");
		expect(await db.select().from(outbox)).toHaveLength(0);
	});

	it("hands records missing from the pull to the removed callback", async () => {
		await mirrorRecords(db, options([order("1"), order("2"), order("3")]));

		const summary = await mirrorRecords(
			db,
			options([order("2")], {
				removed: (rows) =>
					rows.map((row) =>
						db.update(erpOrders).set({ deletedAt: 1 }).where(eq(erpOrders.id, row.id))
					)
			})
		);

		expect(summary.removed).toBe(2);
		const rows = await db.select().from(erpOrders);
		expect(rows.filter((row) => row.deletedAt !== null).map((row) => row.erpId)).toEqual([
			"1",
			"3"
		]);
	});

	it("leaves missing records alone without a removed callback", async () => {
		await mirrorRecords(db, options([order("1"), order("2")]));

		expect((await mirrorRecords(db, options([order("2")]))).removed).toBe(0);
		expect(await db.select().from(erpOrders)).toHaveLength(2);
	});

	it("refuses duplicate keys", async () => {
		await expect(mirrorRecords(db, options([order("1"), order("1")]))).rejects.toThrow(
			'duplicate key "1"'
		);
	});
});
