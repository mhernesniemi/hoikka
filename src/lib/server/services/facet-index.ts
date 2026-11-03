/**
 * In-memory facet index over the public products of the FTS table.
 *
 * Listing pages filter and count facets over the whole catalog on every
 * request; in SQL that means aggregating every product's facet rows each time
 * (~80 ms at 36k products). Here each facet value is a bitset over the
 * products, so a filter is a few AND/ORs and the counts are one pass over the
 * matching products' value ids (~1 ms).
 *
 * The index is rebuilt lazily when `search_index_version` changes: triggers
 * bump it on price, stock and facet changes and reindexProduct on FTS writes,
 * so writes from any process (the app, an import script) are picked up.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import type { ProductSortKey } from "#lib/types.js";

export type Bits = Uint32Array;

type FacetValueRow = { id: number; facet: string; code: string; name: string };

export interface FacetValueCount {
	facetCode: string;
	valueCode: string;
	valueName: string;
	count: number;
}

const SORT_SQL: Record<Exclude<ProductSortKey, "newest">, string> = {
	"price-asc": "min_price IS NULL, min_price ASC, rowid DESC",
	"price-desc": "min_price IS NULL, min_price DESC, rowid DESC",
	"name-asc": "name COLLATE NOCASE ASC, rowid DESC",
	"name-desc": "name COLLATE NOCASE DESC, rowid DESC"
};

export class FacetIndex {
	/** Position → product id, ascending. */
	readonly ids: Int32Array;
	private readonly position = new Map<number, number>();
	private readonly words: number;
	private readonly prices: Float64Array;
	/** Each product's facet value ids: values[offsets[p]..offsets[p + 1]] */
	private readonly offsets: Int32Array;
	private readonly values: Int32Array;
	private readonly maxValueId: number;
	private readonly valueMeta = new Map<
		number,
		{ facetCode: string; code: string; name: string }
	>();
	private readonly valueIds = new Map<string, number>();
	private readonly valueBits = new Map<number, Bits>();
	private readonly cache = new Map<string, Promise<Bits | Int32Array>>();

	constructor(
		rows: { id: number; price: number | null }[],
		links: { productId: number; valueId: number }[],
		values: FacetValueRow[]
	) {
		this.ids = Int32Array.from(rows.map((r) => r.id));
		this.ids.forEach((id, p) => this.position.set(id, p));
		this.words = Math.ceil(this.ids.length / 32);
		this.prices = Float64Array.from(rows.map((r) => r.price ?? NaN));

		const meta = new Map(values.map((v) => [v.id, v]));
		const perProduct: number[][] = Array.from({ length: this.ids.length }, () => []);
		for (const { productId, valueId } of links) {
			const p = this.position.get(productId);
			const v = meta.get(valueId);
			if (p === undefined || !v) continue;
			perProduct[p].push(valueId);
			if (!this.valueMeta.has(valueId)) {
				this.valueMeta.set(valueId, { facetCode: v.facet, code: v.code, name: v.name });
				this.valueIds.set(`${v.facet}\u0000${v.code}`, valueId);
				this.valueBits.set(valueId, this.empty());
			}
			set(this.valueBits.get(valueId)!, p);
		}
		this.offsets = new Int32Array(this.ids.length + 1);
		perProduct.forEach((v, p) => (this.offsets[p + 1] = this.offsets[p] + v.length));
		this.values = Int32Array.from(perProduct.flat());
		this.maxValueId = Math.max(0, ...this.valueMeta.keys());
	}

	get size() {
		return this.ids.length;
	}

	empty(): Bits {
		return new Uint32Array(this.words);
	}

	all(): Bits {
		const bits = this.empty().fill(0xffffffff);
		const tail = this.ids.length % 32;
		if (tail) bits[this.words - 1] = (1 << tail) - 1;
		return bits;
	}

	fromIds(ids: Iterable<number>): Bits {
		const bits = this.empty();
		for (const id of ids) {
			const p = this.position.get(id);
			if (p !== undefined) set(bits, p);
		}
		return bits;
	}

	/** Products with any of the values (OR within a facet). */
	anyOf(facetCode: string, valueCodes: string[]): Bits {
		const bits = this.empty();
		for (const code of valueCodes) {
			const id = this.valueIds.get(`${facetCode}\u0000${code}`);
			if (id !== undefined) or(bits, this.valueBits.get(id)!);
		}
		return bits;
	}

	priced(min: number | undefined, max: number | undefined): Bits {
		const bits = this.empty();
		this.prices.forEach((price, p) => {
			if (
				!Number.isNaN(price) &&
				(min == null || price >= min) &&
				(max == null || price <= max)
			)
				set(bits, p);
		});
		return bits;
	}

	/** Lowest and highest price among the products in `bits`. */
	priceRange(bits: Bits): { min: number; max: number } | null {
		let min = Infinity;
		let max = -Infinity;
		forEach(bits, (p) => {
			const price = this.prices[p];
			if (Number.isNaN(price)) return;
			if (price < min) min = price;
			if (price > max) max = price;
		});
		return min === Infinity ? null : { min, max };
	}

	/** Positions in sort order; "newest" is descending product id. */
	order(sort: Exclude<ProductSortKey, "newest">): Promise<Int32Array> {
		return this.memo(`sort:${sort}`, async () => {
			const rows = (await db.all(
				sql.raw(
					`SELECT rowid AS id FROM product_search_fts WHERE visibility = 'public' ORDER BY ${SORT_SQL[sort]}`
				)
			)) as { id: number }[];
			return Int32Array.from(rows.flatMap((r) => this.position.get(r.id) ?? []));
		}) as Promise<Int32Array>;
	}

	positionOf(id: number): number | undefined {
		return this.position.get(id);
	}

	/** Facet value counts over the products in `bits`, most common first. */
	counts(bits: Bits): Record<string, FacetValueCount[]> {
		const tally = new Int32Array(this.maxValueId + 1);
		forEach(bits, (p) => {
			for (let i = this.offsets[p]; i < this.offsets[p + 1]; i++) tally[this.values[i]]++;
		});
		const result: Record<string, FacetValueCount[]> = {};
		for (const [valueId, meta] of this.valueMeta) {
			const count = tally[valueId];
			if (count === 0) continue;
			(result[meta.facetCode] ??= []).push({
				facetCode: meta.facetCode,
				valueCode: meta.code,
				valueName: meta.name,
				count
			});
		}
		for (const list of Object.values(result)) list.sort((a, b) => b.count - a.count);
		return result;
	}

	private memo<T extends Bits | Int32Array>(key: string, build: () => Promise<T>): Promise<T> {
		let hit = this.cache.get(key);
		if (!hit) {
			hit = build();
			hit.catch(() => this.cache.delete(key));
			this.cache.set(key, hit);
		}
		return hit as Promise<T>;
	}
}

const set = (bits: Bits, p: number) => (bits[p >>> 5] |= 1 << (p & 31));

export const has = (bits: Bits, p: number) => (bits[p >>> 5] & (1 << (p & 31))) !== 0;

export function and(target: Bits, other: Bits): Bits {
	for (let i = 0; i < target.length; i++) target[i] &= other[i];
	return target;
}

function or(target: Bits, other: Bits): Bits {
	for (let i = 0; i < target.length; i++) target[i] |= other[i];
	return target;
}

export function popcount(bits: Bits): number {
	let n = 0;
	for (let w of bits) {
		w -= (w >>> 1) & 0x55555555;
		w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
		n += (((w + (w >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
	}
	return n;
}

function forEach(bits: Bits, fn: (p: number) => void) {
	for (let i = 0; i < bits.length; i++) {
		let w = bits[i];
		while (w) {
			const lowest = w & -w;
			fn(i * 32 + 31 - Math.clz32(lowest));
			w ^= lowest;
		}
	}
}

let current: { version: number; index: Promise<FacetIndex> } | null = null;

async function build(): Promise<FacetIndex> {
	const rows = (await db.all(sql`
		SELECT rowid AS id, min_price AS price FROM product_search_fts
		WHERE visibility = 'public' ORDER BY rowid`)) as { id: number; price: number | null }[];
	// Plain id pairs: joining the names onto 300k+ rows doubles the build time
	const links = (await db.all(sql`
		SELECT product_id AS productId, facet_value_id AS valueId FROM product_facet_values`)) as {
		productId: number;
		valueId: number;
	}[];
	const values = (await db.all(sql`
		SELECT fv.id, f.code AS facet, fv.code, fv.name
		FROM facet_values fv JOIN facets f ON f.id = fv.facet_id`)) as FacetValueRow[];
	return new FacetIndex(rows, links, values);
}

/** The index for the current data, rebuilt when listing data has changed. */
export async function facetIndex(): Promise<FacetIndex> {
	const row = (await db.get(sql`SELECT version FROM search_index_version WHERE id = 1`)) as
		{ version: number } | undefined;
	const version = row?.version ?? 0;
	if (!current || current.version !== version) {
		const index = build();
		index.catch(() => {
			if (current?.index === index) current = null;
		});
		current = { version, index };
	}
	return current.index;
}
