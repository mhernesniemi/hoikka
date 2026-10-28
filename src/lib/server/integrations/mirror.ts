/**
 * Mirror records from an external system (ERP, PIM) into a local table, keyed
 * by their external id and skipped when unchanged.
 *
 * Each mirrored row stores a hash of the source record it was written from.
 * An unchanged record costs one in-memory comparison. A changed one is written
 * in one atomic batch together with its outbox events and its new hash, so a
 * failure leaves the old hash and the record, notifications included, is
 * retried on the next run. Relative imports only, so a seed script can run the
 * same sync through plain tsx with its own db.
 */
import { eq, getTableColumns, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../db/index.js";
import { runAtomic } from "../db/run-atomic.js";
import { outbox } from "../db/schema.js";
import { eventRow, type EmitOptions } from "./event-row.js";

type MirrorTable = SQLiteTable & { id: AnySQLiteColumn };

export interface MirrorEvent extends EmitOptions {
	type: string;
	payload: unknown;
}

export interface MirrorOptions<Source, Table extends MirrorTable> {
	records: readonly Source[];
	/** The record's external id. */
	key: (record: Source) => string;
	table: Table;
	/** The column holding the external id. */
	keyColumn: AnySQLiteColumn;
	/** A text column holding the hash of the source record last written. */
	hashColumn: AnySQLiteColumn;
	/** Values for a new record's first insert, for NOT NULL columns without a default. */
	initial?: (record: Source) => Partial<Table["$inferInsert"]>;
	/** The writes for the record's own row and its child rows. Don't await them. */
	write: (record: Source, id: number) => BatchItem<"sqlite">[];
	/** Outbox events for a changed record, from the row the store showed before. */
	changes?: (before: Table["$inferSelect"], record: Source) => MirrorEvent[];
	/**
	 * Called for each row whose key is missing from the records. Pass it only
	 * for a complete pull; return the writes that retire the row (usually a
	 * soft delete), or none for a row already retired.
	 */
	removed?: (row: Table["$inferSelect"]) => BatchItem<"sqlite">[];
}

export interface MirrorSummary {
	total: number;
	/** Existing records written because their source changed. */
	changed: number;
	created: number;
	events: number;
	/** Missing rows retired by this run. */
	removed: number;
}

// D1 binds at most 100 parameters per statement
const CHUNK = 100;

function hashRecord(value: unknown): string {
	const str = JSON.stringify(value);
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function propertyOf(table: SQLiteTable, column: AnySQLiteColumn): string {
	const entry = Object.entries(getTableColumns(table)).find(([, c]) => c === column);
	if (!entry) throw new Error(`mirrorRecords: column ${column.name} is not in the table`);
	return entry[0];
}

async function rowsById<Table extends MirrorTable>(
	db: Db,
	table: Table,
	ids: number[]
): Promise<Table["$inferSelect"][]> {
	const rows: Table["$inferSelect"][] = [];
	for (let i = 0; i < ids.length; i += CHUNK) {
		const chunk = ids.slice(i, i + CHUNK);
		rows.push(
			...((await db
				.select()
				.from(table as SQLiteTable)
				.where(inArray(table.id, chunk))) as Table["$inferSelect"][])
		);
	}
	return rows;
}

export async function mirrorRecords<Source, Table extends MirrorTable>(
	db: Db,
	options: MirrorOptions<Source, Table>
): Promise<MirrorSummary> {
	const { records, table, keyColumn, hashColumn } = options;
	const keyProp = propertyOf(table, keyColumn);
	const hashProp = propertyOf(table, hashColumn);

	const existing = new Map<string, { id: number; hash: string }>();
	const stored = await db
		.select({ id: table.id, key: keyColumn, hash: hashColumn })
		.from(table as SQLiteTable);
	for (const row of stored) {
		existing.set(String(row.key), { id: Number(row.id), hash: String(row.hash ?? "") });
	}

	const summary: MirrorSummary = {
		total: records.length,
		changed: 0,
		created: 0,
		events: 0,
		removed: 0
	};
	const seen = new Set<string>();
	const failed: string[] = [];
	let firstError: unknown;

	for (const record of records) {
		const key = options.key(record);
		if (seen.has(key)) throw new Error(`mirrorRecords: duplicate key "${key}"`);
		seen.add(key);

		const hash = hashRecord(record);
		const current = existing.get(key);
		if (current?.hash === hash) continue;

		try {
			let id = current?.id;
			if (id === undefined) {
				// An empty hash marks a write that never finished; the next run
				// treats the row as new again rather than as a change.
				const [inserted] = await db
					.insert(table)
					.values({
						...options.initial?.(record),
						[keyProp]: key,
						[hashProp]: ""
					} as never)
					.returning({ id: table.id });
				id = Number(inserted.id);
			}
			// Only a row the store has already shown can change; a new or
			// unfinished one fires no events.
			const isNew = !current?.hash;
			const events =
				!isNew && options.changes
					? options.changes((await rowsById(db, table, [id]))[0], record)
					: [];
			await runAtomic(db, [
				...options.write(record, id),
				...events.map((event) =>
					db.insert(outbox).values(eventRow(event.type, event.payload, event))
				),
				db
					.update(table)
					.set({ [hashProp]: hash } as never)
					.where(eq(table.id, id))
			]);
			if (isNew) summary.created++;
			else summary.changed++;
			summary.events += events.length;
		} catch (err) {
			failed.push(key);
			firstError ??= err;
		}
	}

	if (options.removed) {
		const missing = [...existing].filter(([key]) => !seen.has(key)).map(([, row]) => row.id);
		if (missing.length > 0) {
			const writes = (await rowsById(db, table, missing))
				.map((row) => options.removed!(row))
				.filter((rowWrites) => rowWrites.length > 0);
			await runAtomic(db, writes.flat());
			summary.removed = writes.length;
		}
	}

	if (failed.length > 0) {
		const message = firstError instanceof Error ? firstError.message : String(firstError);
		throw new Error(
			`${failed.length} of ${records.length} records failed to mirror (${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ", ..." : ""}): ${message}`,
			{ cause: firstError }
		);
	}
	return summary;
}
